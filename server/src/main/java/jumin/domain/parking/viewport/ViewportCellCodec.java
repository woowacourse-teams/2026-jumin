package jumin.domain.parking.viewport;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.zip.CRC32C;

public class ViewportCellCodec {

    private static final int MAGIC = 0x4A565331;
    private static final int TTL_MAGIC = 0x4A565432;
    private final int maxBytes;
    private final int maxRows;

    public ViewportCellCodec(int maxBytes, int maxRows) {
        this.maxBytes = maxBytes;
        this.maxRows = maxRows;
    }

    public byte[] encode(ViewportCell cell) {
        if (cell.items().size() > maxRows) {
            throw new IllegalArgumentException("셀 항목 한도를 초과했습니다.");
        }
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            DataOutputStream out = new DataOutputStream(bytes);
            ViewportCellKey key = cell.key();
            out.writeInt(key.versioned() ? MAGIC : TTL_MAGIC);
            out.writeUTF(key.environment());
            out.writeInt(key.schema());
            out.writeInt(key.policy());
            out.writeLong(key.version().epoch().getMostSignificantBits());
            out.writeLong(key.version().epoch().getLeastSignificantBits());
            out.writeLong(key.version().revision());
            out.writeInt(key.version().gridSizeMeters());
            out.writeLong(key.cellId());
            out.writeBoolean(true);
            out.writeInt(cell.items().size());
            for (ViewportItem item : cell.items()) {
                out.writeLong(item.id());
                out.writeDouble(item.latitude());
                out.writeDouble(item.longitude());
                out.writeBoolean(item.capacity() != null);
                if (item.capacity() != null) {
                    out.writeInt(item.capacity());
                }
                writeNullable(out, item.mechanical());
                writeNullable(out, item.isPublic());
                writeNullable(out, item.weekdayPaid());
                writeNullable(out, item.saturdayPaid());
                writeNullable(out, item.holidayPaid());
                if (bytes.size() > maxBytes - Integer.BYTES) {
                    throw new IllegalArgumentException("셀 byte 한도를 초과했습니다.");
                }
            }
            byte[] data = bytes.toByteArray();
            CRC32C crc = new CRC32C();
            crc.update(data);
            out.writeInt((int) crc.getValue());
            if (bytes.size() > maxBytes) {
                throw new IllegalArgumentException("셀 byte 한도를 초과했습니다.");
            }
            return bytes.toByteArray();
        } catch (IOException failure) {
            throw new IllegalStateException("셀 직렬화에 실패했습니다.", failure);
        }
    }

    public long encodedSize(ViewportCell cell) {
        long size = 59L + cell.key().environment().length();
        for (ViewportItem item : cell.items()) {
            size += item.capacity() == null ? 30 : 34;
        }
        return size;
    }

    public ViewportCell decode(ViewportCellKey expected, byte[] bytes) {
        return decode(expected, bytes, Long.MAX_VALUE);
    }

    public ViewportCell decode(ViewportCellKey expected, byte[] bytes, long decodedBudget) {
        if (bytes == null || bytes.length < 60 || bytes.length > maxBytes) {
            throw new IllegalArgumentException("셀 byte 크기가 유효하지 않습니다.");
        }
        try {
            int length = bytes.length - Integer.BYTES;
            CRC32C crc = new CRC32C();
            crc.update(bytes, 0, length);
            DataInputStream checksum = new DataInputStream(new ByteArrayInputStream(bytes, length, Integer.BYTES));
            if (crc.getValue() != Integer.toUnsignedLong(checksum.readInt())) {
                throw new IllegalArgumentException("셀 checksum이 일치하지 않습니다.");
            }
            DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes, 0, length));
            int magic = in.readInt();
            if (magic != MAGIC && magic != TTL_MAGIC) {
                throw new IllegalArgumentException("셀 schema를 확인할 수 없습니다.");
            }
            String environment = in.readUTF();
            int schema = in.readInt();
            int policy = in.readInt();
            UUID epoch = new UUID(in.readLong(), in.readLong());
            long revision = in.readLong();
            int gridSizeMeters = in.readInt();
            long cellId = in.readLong();
            ViewportCellKey actual = new ViewportCellKey(environment, schema, policy,
                    new ViewportVersion(epoch, revision, gridSizeMeters, true), cellId, magic == MAGIC);
            if (!expected.equals(actual) || !in.readBoolean()) {
                throw new IllegalArgumentException("완전한 동일 버전 셀만 사용할 수 있습니다.");
            }
            int count = in.readInt();
            if (count < 0 || count > in.available() / 30) {
                throw new IllegalArgumentException("셀 항목 수가 유효하지 않습니다.");
            }
            if (count > maxRows || ViewportCell.estimatedHeapBytes(count) > decodedBudget) {
                throw new ViewportStoreBudgetException("원격 cache의 행 또는 decoded heap 한도를 초과했습니다.");
            }
            List<ViewportItem> items = new ArrayList<>(count);
            for (int index = 0; index < count; index++) {
                long id = in.readLong();
                double latitude = in.readDouble();
                double longitude = in.readDouble();
                Integer capacity = in.readBoolean() ? in.readInt() : null;
                items.add(new ViewportItem(id, latitude, longitude, capacity,
                        readNullable(in), readNullable(in), readNullable(in), readNullable(in), readNullable(in)));
            }
            if (in.available() != 0) {
                throw new IllegalArgumentException("셀 뒤에 알 수 없는 데이터가 있습니다.");
            }
            return new ViewportCell(actual, items);
        } catch (IOException failure) {
            throw new IllegalArgumentException("셀을 해석할 수 없습니다.", failure);
        }
    }

    private void writeNullable(DataOutputStream out, Boolean value) throws IOException {
        out.writeByte(value == null ? -1 : value ? 1 : 0);
    }

    private Boolean readNullable(DataInputStream in) throws IOException {
        return switch (in.readByte()) {
            case -1 -> null;
            case 0 -> false;
            case 1 -> true;
            default -> throw new IllegalArgumentException("nullable boolean 표현이 유효하지 않습니다.");
        };
    }
}
