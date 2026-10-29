package jumin.domain.parking.viewport;

import java.io.BufferedWriter;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.SequenceInputStream;
import java.nio.channels.Channels;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.LinkOption;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.attribute.PosixFileAttributes;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.UserPrincipal;
import java.nio.file.attribute.PosixFilePermissions;
import java.nio.file.StandardOpenOption;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import org.springframework.core.io.InputStreamResource;
import org.springframework.stereotype.Component;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;

@Component
public class ViewportSpool implements AutoCloseable {

    private final ViewportCacheProperties properties;
    private final ParkingLodScoreCalculator scores;
    private final AtomicLong reserved = new AtomicLong();
    private final Path root;
    private final Map<Path, Long> failedDeletes = new ConcurrentHashMap<>();
    private Path directory;
    private FileChannel ownershipChannel;
    private FileLock ownershipLock;
    private ScheduledExecutorService janitor;
    private volatile boolean closed;

    @Autowired
    public ViewportSpool(ViewportCacheProperties properties, ParkingLodScoreCalculator scores) {
        this(properties, scores, Path.of(System.getProperty("java.io.tmpdir"), "jumin-viewport-spool-v2"));
    }

    ViewportSpool(ViewportCacheProperties properties, ParkingLodScoreCalculator scores, Path root) {
        this.properties = properties;
        this.scores = scores;
        this.root = root;
    }

    public Builder builder() {
        if (closed) {
            throw new ViewportUnavailableException("viewport 임시 저장소를 종료합니다.");
        }
        return new Builder();
    }

    private synchronized Path directory() throws IOException {
        if (closed || failedDeletes.size() >= 256) {
            throw new ViewportUnavailableException("viewport 임시 파일 정리를 기다립니다.");
        }
        if (directory != null) {
            return directory;
        }
        UserPrincipal owner = root.getFileSystem().getUserPrincipalLookupService()
                .lookupPrincipalByName(System.getProperty("user.name"));
        Path parent = root.toAbsolutePath().getParent().toRealPath();
        verifyAncestors(parent, owner);
        Path privateRoot = parent.resolve(root.getFileName());
        privateDirectory(privateRoot, owner);
        String reader = properties.getReadUsername() == null ? "local" : properties.getReadUsername();
        String identity = encode(properties.getEnvironment()) + "." + encode(reader);
        Path candidate = privateRoot.resolve(identity);
        privateDirectory(candidate, owner);
        Path lockFile = candidate.resolve(".lock");
        try {
            Files.createFile(lockFile, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
        } catch (FileAlreadyExistsException existing) {
            verifyPrivateFile(lockFile, owner);
        }
        FileChannel channel = FileChannel.open(lockFile, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS);
        FileLock lock = null;
        try {
            try {
                lock = channel.tryLock();
            } catch (OverlappingFileLockException failure) {
                throw new ViewportUnavailableException("같은 viewport spool 소유권이 이미 사용 중입니다.", failure);
            }
            if (lock == null) {
                throw new ViewportUnavailableException("같은 viewport spool 계정을 다른 process가 사용하고 있습니다.");
            }
            try (var children = Files.list(candidate)) {
                for (Path child : children.filter(path -> path.getFileName().toString().startsWith("viewport-")
                        && path.getFileName().toString().endsWith(".json")).toList()) {
                    deleteFile(child);
                }
            }
            ownershipChannel = channel;
            ownershipLock = lock;
            directory = candidate;
            janitor = Executors.newSingleThreadScheduledExecutor(task -> {
                Thread thread = new Thread(task, "viewport-spool-cleanup");
                thread.setDaemon(true);
                return thread;
            });
            janitor.scheduleWithFixedDelay(this::retryDeletes, 1, 1, TimeUnit.SECONDS);
            return directory;
        } catch (RuntimeException | IOException failure) {
            if (lock != null) {
                lock.close();
            }
            channel.close();
            throw failure;
        }
    }

    private static String encode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static void verifyAncestors(Path parent, UserPrincipal owner) throws IOException {
        for (Path path = parent; path != null; path = path.getParent()) {
            PosixFileAttributes attributes = Files.readAttributes(path, PosixFileAttributes.class,
                    LinkOption.NOFOLLOW_LINKS);
            boolean rootOwned = ((Number) Files.getAttribute(path, "unix:uid", LinkOption.NOFOLLOW_LINKS)).longValue() == 0;
            boolean sharedWrite = attributes.permissions().contains(PosixFilePermission.GROUP_WRITE)
                    || attributes.permissions().contains(PosixFilePermission.OTHERS_WRITE);
            int mode = ((Number) Files.getAttribute(path, "unix:mode", LinkOption.NOFOLLOW_LINKS)).intValue();
            if (!attributes.isDirectory() || (!rootOwned && !attributes.owner().equals(owner))
                    || (sharedWrite && !(rootOwned && (mode & 01000) != 0))) {
                throw new IOException("viewport spool ancestor is not a trusted directory");
            }
        }
    }

    private static void privateDirectory(Path path, UserPrincipal owner) throws IOException {
        try {
            Files.createDirectory(path, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        } catch (FileAlreadyExistsException existing) {
            // Never repair a pre-existing untrusted directory in place.
        }
        PosixFileAttributes attributes = Files.readAttributes(path, PosixFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!attributes.isDirectory() || !attributes.owner().equals(owner)
                || !attributes.permissions().equals(PosixFilePermissions.fromString("rwx------"))) {
            throw new IOException("viewport spool requires an owned private directory");
        }
    }

    private static void verifyPrivateFile(Path path, UserPrincipal owner) throws IOException {
        PosixFileAttributes attributes = Files.readAttributes(path, PosixFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!attributes.isRegularFile() || !attributes.owner().equals(owner)
                || !attributes.permissions().equals(PosixFilePermissions.fromString("rw-------"))) {
            throw new IOException("viewport spool lock is not a private regular file");
        }
    }

    void retryDeletes() {
        failedDeletes.forEach((file, size) -> {
            try {
                deleteFile(file);
                if (failedDeletes.remove(file, size)) {
                    reserved.addAndGet(-size);
                }
            } catch (IOException ignored) {
                // Retain the reservation until unlink succeeds or restart cleanup acquires the ownership lock.
            }
        });
    }

    protected void deleteFile(Path path) throws IOException {
        Files.deleteIfExists(path);
    }

    long reservedBytes() {
        return reserved.get();
    }

    @Override
    @PreDestroy
    public synchronized void close() {
        closed = true;
        if (janitor != null) {
            janitor.shutdownNow();
        }
        retryDeletes();
        try {
            if (ownershipLock != null) {
                ownershipLock.close();
                ownershipChannel.close();
            }
        } catch (IOException ignored) {
            // OS process termination also releases this ownership lock.
        }
    }

    public final class Builder implements AutoCloseable {
        private final List<ParkingLotViewportResponse> rows = new ArrayList<>();
        private Path file;
        private BufferedWriter writer;
        private FileChannel content;
        private long bytes;
        private int count;
        private final AtomicBoolean disposed = new AtomicBoolean();

        public void add(ViewportItem item) {
            if (closed) {
                throw new ViewportUnavailableException("viewport 임시 저장소를 종료합니다.");
            }
            if (count >= properties.getMaxFallbackRows()) {
                throw new ViewportUnavailableException("전체 viewport 결과의 행 한도를 초과했습니다.");
            }
            ParkingLotViewportResponse row = new ParkingLotViewportResponse(item.id(), item.latitude(),
                    item.longitude(), scores.calculate(item.capacity()));
            try {
                if (file == null && (count + 1L) * 160L > properties.getMaxRequestBytes()) {
                    file = Files.createTempFile(directory(), "viewport-", ".json",
                            PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
                    content = FileChannel.open(file, StandardOpenOption.READ, StandardOpenOption.WRITE,
                            LinkOption.NOFOLLOW_LINKS);
                    writer = new BufferedWriter(Channels.newWriter(content, StandardCharsets.UTF_8));
                    append("[");
                    for (int index = 0; index < rows.size(); index++) {
                        append((index == 0 ? "" : ",") + json(rows.get(index)));
                    }
                    rows.clear();
                }
                if (file == null) {
                    rows.add(row);
                } else {
                    append((count == 0 ? "" : ",") + json(row));
                }
                count++;
            } catch (IOException | UnsupportedOperationException failure) {
                throw new ViewportUnavailableException("전체 viewport 응답을 준비할 수 없습니다.", failure);
            }
        }

        public ViewportBody build() {
            if (file == null) {
                return new ViewportBody(ParkingLotViewportResponses.from(rows), this::close);
            }
            try {
                append("]");
                writer.flush();
                writer = null;
                content.position(0);
                byte[] prefix = ("{\"totalCount\":" + count + ",\"parkingLots\":").getBytes(StandardCharsets.UTF_8);
                byte[] suffix = "}".getBytes(StandardCharsets.UTF_8);
                InputStream stream = new SequenceInputStream(Collections.enumeration(List.of(
                        new ByteArrayInputStream(prefix), Channels.newInputStream(content),
                        new ByteArrayInputStream(suffix))));
                // Exact InputStreamResource is single-use. Spring skips length probing and Range conversion.
                InputStreamResource resource = new InputStreamResource(stream, "complete viewport JSON");
                return new ViewportBody(resource, this::close);
            } catch (IOException failure) {
                throw new ViewportUnavailableException("전체 viewport 응답 준비에 실패했습니다.", failure);
            }
        }

        private void append(String text) throws IOException {
            long size = text.length();
            if (bytes + size > properties.getMaxSpoolBytes()) {
                throw new ViewportUnavailableException("viewport 파일 한도를 초과했습니다.");
            }
            while (true) {
                long current = reserved.get();
                if (current + size > properties.getMaxTotalSpoolBytes()) {
                    throw new ViewportUnavailableException("viewport 임시 저장소가 가득 찼습니다.");
                }
                if (reserved.compareAndSet(current, current + size)) {
                    bytes += size;
                    break;
                }
            }
            writer.write(text);
        }

        @Override
        public void close() {
            if (!disposed.compareAndSet(false, true)) {
                return;
            }
            try {
                if (writer != null) {
                    writer.close();
                }
            } catch (IOException ignored) {
                // Deletion below still releases the owned file.
            }
            try {
                if (content != null) {
                    content.close();
                }
            } catch (IOException ignored) {
                // Always try both close and unlink, including after a writer close failure.
            }
            if (file != null) {
                try {
                    deleteFile(file);
                } catch (IOException failure) {
                    failedDeletes.put(file, bytes);
                    rows.clear();
                    return;
                }
            }
            reserved.addAndGet(-bytes);
            rows.clear();
        }
    }

    private static String json(ParkingLotViewportResponse row) {
        return "{\"id\":" + row.id() + ",\"latitude\":" + row.latitude()
                + ",\"longitude\":" + row.longitude() + ",\"score\":" + row.score() + "}";
    }
}
