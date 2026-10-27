package jumin.domain.admin.parking.csv;

import java.io.Closeable;
import java.io.IOException;
import java.io.Reader;
import java.util.Arrays;
import org.apache.commons.csv.CSVException;

/**
 * 쉼표, 큰따옴표, CR/LF를 사용하는 CSV를 한 레코드씩 읽는다.
 * 빈 행, 엄격한 따옴표 종료, 닫는 따옴표 뒤 공백은 기존 RFC4180 설정과 같다.
 * 현재 레코드는 다음 next() 호출 전까지만 유효하다.
 */
final class ParkingCsvRecordReader implements Closeable {

    private static final int UNREAD = -2;
    private static final int MAX_CACHED_LENGTH = 1_024;
    private static final int COLUMN_COUNT = ParkingCsvColumn.values().length;

    private final Reader reader;
    private final char[] input = new char[8_192];
    private final StringBuilder field = new StringBuilder(256);
    private final String[] cachedFields = new String[COLUMN_COUNT];
    private final boolean[] ignoredColumns = new boolean[COLUMN_COUNT];
    private final ParkingCsvToken[] deferredFields = new ParkingCsvToken[COLUMN_COUNT];
    private String[] values = new String[COLUMN_COUNT];
    private int offset;
    private int limit;
    private int pending = UNREAD;
    private int size;
    private long recordNumber;

    ParkingCsvRecordReader(Reader reader) {
        this.reader = reader;
    }

    void ignoreColumns(int... indexes) {
        for (int index : indexes) {
            ignoredColumns[index] = true;
            cachedFields[index] = null;
        }
    }

    void deferColumns(int... indexes) {
        for (int index : indexes) {
            deferredFields[index] = new ParkingCsvToken();
            cachedFields[index] = null;
        }
    }

    ParkingCsvToken token(int index) {
        if (index < 0 || index >= size || index >= deferredFields.length || deferredFields[index] == null) {
            throw new IllegalArgumentException("지연 변환 열이 아닙니다.");
        }
        return deferredFields[index];
    }

    boolean next() throws IOException {
        Arrays.fill(values, 0, size, null);
        for (ParkingCsvToken token : deferredFields) {
            if (token != null) {
                token.reset("");
            }
        }
        size = 0;
        int character = read();
        if (character == -1) {
            return false;
        }
        while (true) {
            boolean ignored = size < ignoredColumns.length && ignoredColumns[size];
            field.setLength(0);
            int terminator = readField(character, ignored);
            appendField(ignored);
            if (terminator == ',') {
                character = read();
                continue;
            }
            if (terminator == '\r') {
                int next = read();
                if (next != '\n') {
                    pending = next;
                }
            }
            recordNumber++;
            return true;
        }
    }

    int size() {
        return size;
    }

    String get(int index) {
        if (index < 0 || index >= size) {
            throw new IndexOutOfBoundsException(index);
        }
        if (index < deferredFields.length && deferredFields[index] != null) {
            return deferredFields[index].rawString();
        }
        return values[index];
    }

    long getRecordNumber() {
        return recordNumber;
    }

    private int readField(int character, boolean ignored) throws IOException {
        if (character == '"') {
            return readQuotedField(ignored);
        }
        while (character != ',' && character != '\r' && character != '\n' && character != -1) {
            append(character, ignored);
            character = read();
        }
        return character;
    }

    private int readQuotedField(boolean ignored) throws IOException {
        while (true) {
            int character = read();
            if (character == -1) {
                throw new CSVException("EOF reached before quoted field finished");
            }
            if (character != '"') {
                append(character, ignored);
                continue;
            }
            int next = read();
            if (next == '"') {
                append(next, ignored);
                continue;
            }
            return readQuotedTerminator(next);
        }
    }

    private int readQuotedTerminator(int character) throws IOException {
        while (character != ',' && character != '\r' && character != '\n' && character != -1) {
            if (!Character.isWhitespace((char) character)) {
                throw new CSVException("Invalid character after quoted field");
            }
            character = read();
        }
        return character;
    }

    private void append(int character, boolean ignored) {
        if (!ignored) {
            field.append((char) character);
        }
    }

    private void appendField(boolean ignored) {
        if (size == values.length) {
            values = Arrays.copyOf(values, values.length * 2);
        }
        if (!ignored && size < deferredFields.length && deferredFields[size] != null) {
            deferredFields[size++].reset(field);
            return;
        }
        if (ignored || field.isEmpty()) {
            values[size++] = "";
            return;
        }
        if (size < cachedFields.length && field.length() <= MAX_CACHED_LENGTH) {
            String cached = cachedFields[size];
            if (cached != null && cached.contentEquals(field)) {
                values[size++] = cached;
                return;
            }
            String value = field.toString();
            cachedFields[size] = value;
            values[size++] = value;
            return;
        }
        values[size++] = field.toString();
    }

    private int read() throws IOException {
        if (pending != UNREAD) {
            int character = pending;
            pending = UNREAD;
            return character;
        }
        while (offset >= limit) {
            limit = reader.read(input);
            offset = 0;
            if (limit == -1) {
                return -1;
            }
        }
        return input[offset++];
    }

    @Override
    public void close() throws IOException {
        reader.close();
    }
}
