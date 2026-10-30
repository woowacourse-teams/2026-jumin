package jumin.domain.parking.viewport;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.CRC32C;

public class ViewportCellCodec {

    private static final int MAGIC = 0x4A565433;
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
            writeHeader(out, cell);
            writeItems(out, bytes, cell.items());
            writeChecksum(out, bytes);
            requireEncodedSize(bytes.size(), maxBytes);
            return bytes.toByteArray();
        } catch (IOException failure) {
            throw new IllegalStateException("셀 직렬화에 실패했습니다.", failure);
        }
    }

    private void writeHeader(DataOutputStream out, ViewportCell cell) throws IOException {
        ViewportCellKey key = cell.key();
        out.writeInt(MAGIC);
        out.writeUTF(key.environment());
        out.writeInt(key.schema());
        out.writeInt(key.policy());
        out.writeInt(key.gridSizeMeters());
        out.writeLong(key.cellId());
        out.writeInt(cell.items().size());
    }

    private void writeItems(DataOutputStream out, ByteArrayOutputStream bytes, List<ViewportItem> items)
            throws IOException {
        for (ViewportItem item : items) {
            writeItem(out, item);
            requireEncodedSize(bytes.size(), maxBytes - Integer.BYTES);
        }
    }

    private void writeItem(DataOutputStream out, ViewportItem item) throws IOException {
        out.writeLong(item.id());
        out.writeDouble(item.latitude());
        out.writeDouble(item.longitude());
        writeCapacity(out, item.capacity());
        writeNullable(out, item.mechanical());
        writeNullable(out, item.isPublic());
        writeNullable(out, item.weekdayPaid());
        writeNullable(out, item.saturdayPaid());
        writeNullable(out, item.holidayPaid());
    }

    private void writeCapacity(DataOutputStream out, Integer capacity) throws IOException {
        out.writeBoolean(capacity != null);
        if (capacity == null) {
            return;
        }
        out.writeInt(capacity);
    }

    private void writeChecksum(DataOutputStream out, ByteArrayOutputStream bytes) throws IOException {
        CRC32C crc = new CRC32C();
        crc.update(bytes.toByteArray());
        out.writeInt((int) crc.getValue());
    }

    private void requireEncodedSize(int size, int limit) {
        if (size > limit) {
            throw new IllegalArgumentException("셀 byte 한도를 초과했습니다.");
        }
    }

    public long encodedSize(ViewportCell cell) {
        long size = 34L + cell.key().environment().length();
        for (ViewportItem item : cell.items()) {
            size += encodedItemSize(item);
        }
        return size;
    }

    private int encodedItemSize(ViewportItem item) {
        if (item.capacity() == null) {
            return 30;
        }
        return 34;
    }

    public ViewportCell decode(ViewportCellKey expected, byte[] bytes) {
        return decode(expected, bytes, Long.MAX_VALUE);
    }

    public ViewportCell decode(ViewportCellKey expected, byte[] bytes, long decodedBudget) {
        requireValidSize(bytes);
        try {
            int length = bytes.length - Integer.BYTES;
            verifyChecksum(bytes, length);
            DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes, 0, length));
            ViewportCellKey actual = readKey(in, expected);
            List<ViewportItem> items = readItems(in, decodedBudget);
            if (in.available() != 0) {
                throw new IllegalArgumentException("셀 뒤에 알 수 없는 데이터가 있습니다.");
            }
            return new ViewportCell(actual, items);
        } catch (IOException failure) {
            throw new IllegalArgumentException("셀을 해석할 수 없습니다.", failure);
        }
    }

    private void requireValidSize(byte[] bytes) {
        if (bytes == null || bytes.length < 35 || bytes.length > maxBytes) {
            throw new IllegalArgumentException("셀 byte 크기가 유효하지 않습니다.");
        }
    }

    private void verifyChecksum(byte[] bytes, int length) throws IOException {
        CRC32C crc = new CRC32C();
        crc.update(bytes, 0, length);
        DataInputStream checksum = new DataInputStream(new ByteArrayInputStream(bytes, length, Integer.BYTES));
        if (crc.getValue() != Integer.toUnsignedLong(checksum.readInt())) {
            throw new IllegalArgumentException("셀 checksum이 일치하지 않습니다.");
        }
    }

    private ViewportCellKey readKey(DataInputStream in, ViewportCellKey expected) throws IOException {
        if (in.readInt() != MAGIC) {
            throw new IllegalArgumentException("셀 schema를 확인할 수 없습니다.");
        }
        ViewportCellKey actual = new ViewportCellKey(in.readUTF(), in.readInt(), in.readInt(), in.readInt(), in.readLong());
        if (!expected.equals(actual)) {
            throw new IllegalArgumentException("동일한 namespace와 격자의 셀만 사용할 수 있습니다.");
        }
        return actual;
    }

    private List<ViewportItem> readItems(DataInputStream in, long decodedBudget) throws IOException {
        int count = in.readInt();
        requireValidItemCount(count, in.available(), decodedBudget);
        List<ViewportItem> items = new ArrayList<>(count);
        for (int index = 0; index < count; index++) {
            items.add(readItem(in));
        }
        return items;
    }

    private void requireValidItemCount(int count, int availableBytes, long decodedBudget) {
        if (count < 0 || count > availableBytes / 30) {
            throw new IllegalArgumentException("셀 항목 수가 유효하지 않습니다.");
        }
        if (count > maxRows || ViewportCell.estimatedHeapBytes(count) > decodedBudget) {
            throw new ViewportStoreBudgetException("원격 cache의 행 또는 decoded heap 한도를 초과했습니다.");
        }
    }

    private ViewportItem readItem(DataInputStream in) throws IOException {
        return new ViewportItem(in.readLong(), in.readDouble(), in.readDouble(), readCapacity(in),
                readNullable(in), readNullable(in), readNullable(in), readNullable(in), readNullable(in));
    }

    private Integer readCapacity(DataInputStream in) throws IOException {
        if (!in.readBoolean()) {
            return null;
        }
        return in.readInt();
    }

    private void writeNullable(DataOutputStream out, Boolean value) throws IOException {
        if (value == null) {
            out.writeByte(-1);
            return;
        }
        if (value) {
            out.writeByte(1);
            return;
        }
        out.writeByte(0);
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
