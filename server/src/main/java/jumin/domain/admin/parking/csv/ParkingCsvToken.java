package jumin.domain.admin.parking.csv;

/** 현재 레코드 안에서만 사용하는 고정 버퍼 기반 숫자와 시간 필드다. */
final class ParkingCsvToken implements CharSequence {

    private static final int BUFFER_LENGTH = 128;

    private final char[] buffer = new char[BUFFER_LENGTH];
    private String longValue;
    private String rawSnapshot;
    private int rawLength;
    private int start;
    private int end;

    void reset(CharSequence value) {
        rawLength = value.length();
        start = 0;
        end = rawLength;
        rawSnapshot = null;
        longValue = null;
        if (rawLength > buffer.length) {
            longValue = value.toString();
            return;
        }
        for (int index = 0; index < rawLength; index++) {
            buffer[index] = value.charAt(index);
        }
    }

    ParkingCsvToken trimSpaces() {
        start = 0;
        end = rawLength;
        while (start < end && rawCharAt(start) == ' ') {
            start++;
        }
        while (end > start && rawCharAt(end - 1) == ' ') {
            end--;
        }
        return this;
    }

    String rawString() {
        if (longValue != null) {
            return longValue;
        }
        if (rawSnapshot == null) {
            rawSnapshot = new String(buffer, 0, rawLength);
        }
        return rawSnapshot;
    }

    @Override
    public int length() {
        return end - start;
    }

    @Override
    public char charAt(int index) {
        if (index < 0 || index >= length()) {
            throw new IndexOutOfBoundsException(index);
        }
        return rawCharAt(start + index);
    }

    @Override
    public CharSequence subSequence(int startIndex, int endIndex) {
        if (startIndex < 0 || endIndex < startIndex || endIndex > length()) {
            throw new IndexOutOfBoundsException();
        }
        if (longValue != null) {
            return longValue.substring(start + startIndex, start + endIndex);
        }
        return new String(buffer, start + startIndex, endIndex - startIndex);
    }

    @Override
    public String toString() {
        if (start == 0 && end == rawLength) {
            return rawString();
        }
        return subSequence(0, length()).toString();
    }

    private char rawCharAt(int index) {
        if (longValue != null) {
            return longValue.charAt(index);
        }
        return buffer[index];
    }
}
