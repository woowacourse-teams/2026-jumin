package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import io.lettuce.core.RedisCommandExecutionException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.InputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLHandshakeException;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.utility.DockerImageName;

class RedisViewportTlsIntegrationTest {

    private static final String PASSWORD = "viewport-test-password";
    private static final String WRONG_PASSWORD = "wrong-test-password-never-log";
    private static final char[] KEYSTORE_PASSWORD = "test-only-keystore".toCharArray();
    private static final DockerImageName IMAGE = DockerImageName.parse(
            "redis:7.4.12-bookworm@sha256:b6b6e3dc0c0952737748e55d5d885272840c7e42ba41ab1d5489f693419882f5");
    private static final String ACL = """
            user default off
            user viewport on >viewport-test-password ~jumin:dev_sq_*:viewport:square:wm1:* -@all +ping +echo +select +eval +type +unlink +strlen +get +set +client|setname +client|setinfo
            """;

    @TempDir
    static Path temporary;
    private static Path trustedCertificate;
    private static Path mismatchedCertificate;
    private static String tlsHost;
    private static GenericContainer<?> redis;
    private static GenericContainer<?> wrongNameRedis;

    @BeforeAll
    static void startServers() throws Exception {
        String host = DockerClientFactory.instance().dockerHostIpAddress();
        List<InetAddress> addresses = Arrays.asList(InetAddress.getAllByName(host));
        tlsHost = addresses.stream().filter(Inet4Address.class::isInstance).findFirst()
                .orElse(addresses.getFirst()).getHostAddress();
        CertificateFiles valid = certificate("valid", "ip:" + tlsHost);
        CertificateFiles wrongName = certificate("wrong-name", "dns:wrong-name.invalid");
        trustedCertificate = valid.certificate();
        mismatchedCertificate = wrongName.certificate();
        redis = server(valid);
        wrongNameRedis = server(wrongName);
        try {
            redis.start();
            wrongNameRedis.start();
        } catch (Throwable failure) {
            redis.stop();
            wrongNameRedis.stop();
            throw failure;
        }
    }

    @AfterAll
    static void stopServers() {
        if (wrongNameRedis != null) {
            wrongNameRedis.stop();
        }
        if (redis != null) {
            redis.stop();
        }
    }

    @Test
    @DisplayName("전용 PEM과 분리된 ACL 인증으로 실제 TLS Redis 셀을 쓰고 읽는다")
    void reads_and_writes_over_authenticated_tls_without_changing_default_trust() throws Exception {
        SSLContext defaultTrust = SSLContext.getDefault();
        ViewportCacheProperties properties = properties(redis, trustedCertificate, PASSWORD);
        ViewportCell cell = cell(properties);

        try (RedisViewportCellStore store = store(properties)) {
            store.putMany(List.of(cell), deadline());
            assertThat(store.getMany(List.of(cell.key()), deadline())).containsOnlyKeys(cell.key())
                    .containsEntry(cell.key(), cell);
            assertThat(SSLContext.getDefault()).isSameAs(defaultTrust);
        }
    }

    @Test
    @DisplayName("신뢰하지 않은 인증서나 다른 호스트의 인증서는 실제 Lettuce 연결을 거절한다")
    void rejects_wrong_ca_and_mismatched_ip_or_host() throws Exception {
        Throwable wrongCa = connectionFailureWithoutSecrets(properties(redis, mismatchedCertificate, PASSWORD), PASSWORD);
        assertThat(hasCause(wrongCa, SSLHandshakeException.class)).isTrue();
        Throwable wrongName = connectionFailureWithoutSecrets(
                properties(wrongNameRedis, mismatchedCertificate, PASSWORD), PASSWORD);
        assertThat(hasCause(wrongName, SSLHandshakeException.class)).isTrue();
    }

    @Test
    @DisplayName("잘못된 ACL 비밀번호는 실패하고 예외에 비밀번호를 포함하지 않는다")
    void rejects_wrong_acl_password_without_exposing_it() throws Exception {
        Throwable failure = connectionFailureWithoutSecrets(properties(redis, trustedCertificate, WRONG_PASSWORD),
                WRONG_PASSWORD);
        assertThat(hasCause(failure, RedisCommandExecutionException.class)).isTrue();
    }

    private static Throwable connectionFailureWithoutSecrets(ViewportCacheProperties properties, String secret) {
        try (RedisViewportCellStore store = store(properties)) {
            Throwable failure = catchThrowable(() -> store.getMany(List.of(cell(properties).key()), deadline()));
            assertThat(failure).isInstanceOf(ViewportStoreException.class);
            StringWriter trace = new StringWriter();
            failure.printStackTrace(new PrintWriter(trace));
            assertThat(trace.toString()).doesNotContain(secret);
            return failure;
        }
    }

    private static boolean hasCause(Throwable failure, Class<? extends Throwable> type) {
        for (Throwable current = failure; current != null; current = current.getCause()) {
            if (type.isInstance(current)) {
                return true;
            }
        }
        return false;
    }

    private static GenericContainer<?> server(CertificateFiles files) throws Exception {
        return new GenericContainer<>(IMAGE)
                .withExposedPorts(6379)
                .withCopyToContainer(Transferable.of(Files.readAllBytes(files.certificate()), 0644), "/tmp/redis.crt")
                .withCopyToContainer(Transferable.of(Files.readAllBytes(files.key()), 0644), "/tmp/redis.key")
                .withCopyToContainer(Transferable.of(ACL, 0644), "/tmp/users.acl")
                .withCommand("redis-server", "--port", "0", "--tls-port", "6379", "--tls-cert-file",
                        "/tmp/redis.crt", "--tls-key-file", "/tmp/redis.key", "--tls-auth-clients", "no",
                        "--aclfile", "/tmp/users.acl", "--save", "", "--appendonly", "no");
    }

    private static CertificateFiles certificate(String name, String san) throws Exception {
        Path store = temporary.resolve(name + ".p12");
        Path cert = temporary.resolve(name + ".crt");
        Path key = temporary.resolve(name + ".key");
        Path keytool = Path.of(System.getProperty("java.home"), "bin", "keytool");
        Process process = new ProcessBuilder(keytool.toString(), "-genkeypair", "-noprompt", "-alias", "redis",
                "-keyalg", "RSA", "-keysize", "2048", "-validity", "2", "-dname", "CN=redis-test",
                "-ext", "SAN=" + san, "-ext", "BC:critical=ca:false",
                "-ext", "KU:critical=digitalSignature,keyEncipherment", "-ext", "EKU=serverAuth",
                "-keystore", store.toString(),
                "-storetype", "PKCS12", "-storepass", new String(KEYSTORE_PASSWORD),
                "-keypass", new String(KEYSTORE_PASSWORD))
                .redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
        if (!process.waitFor(30, TimeUnit.SECONDS) || process.exitValue() != 0) {
            process.destroyForcibly();
            throw new IllegalStateException("시험 인증서 생성에 실패했습니다.");
        }
        KeyStore keys = KeyStore.getInstance("PKCS12");
        try (InputStream input = Files.newInputStream(store)) {
            keys.load(input, KEYSTORE_PASSWORD);
        }
        Certificate certificate = keys.getCertificate("redis");
        PrivateKey privateKey = (PrivateKey) keys.getKey("redis", KEYSTORE_PASSWORD);
        Files.writeString(cert, pem("CERTIFICATE", certificate.getEncoded()), StandardCharsets.US_ASCII);
        Files.writeString(key, pem("PRIVATE KEY", privateKey.getEncoded()), StandardCharsets.US_ASCII);
        return new CertificateFiles(cert, key);
    }

    private static String pem(String label, byte[] value) {
        return "-----BEGIN " + label + "-----\n"
                + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(value)
                + "\n-----END " + label + "-----\n";
    }

    private static ViewportCacheProperties properties(GenericContainer<?> server, Path certificate, String password)
            throws Exception {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setEnvironment("dev_sq_tls_" + UUID.randomUUID().toString().replace("-", ""));
        properties.setRedisUri(new URI("rediss", null, tlsHost, server.getMappedPort(6379),
                null, null, null).toString());
        properties.setRedisUsername("viewport");
        properties.setRedisPassword(password);
        properties.setRedisTlsCaFile(certificate.toString());
        properties.setRequestTimeout(Duration.ofSeconds(10));
        properties.setCacheTimeout(Duration.ofSeconds(5));
        properties.setRedisConnectTimeout(Duration.ofSeconds(5));
        return properties;
    }

    private static RedisViewportCellStore store(ViewportCacheProperties properties) {
        return new RedisViewportCellStore(properties,
                new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                new ViewportCellCover(new ViewportSquareGrid(), properties),
                new ViewportMetrics(new SimpleMeterRegistry()));
    }

    private static ViewportCell cell(ViewportCacheProperties properties) {
        long cellId = new ViewportSquareGrid().cellId(37.5, 127.0, properties.getGridSizeMeters());
        ViewportCellKey key = new ViewportCellKey(properties.getEnvironment(), properties.getSchema(),
                properties.getPolicy(), properties.getGridSizeMeters(), cellId);
        return new ViewportCell(key, List.of(new ViewportItem(1, 37.5, 127.0, 50,
                false, true, false, false, false)));
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(10));
    }

    private record CertificateFiles(Path certificate, Path key) { }
}
