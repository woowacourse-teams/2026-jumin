package jumin.domain.admin.parking.support;

public final class ParkingText {

    private ParkingText() {
    }

    // DB의 btrim과 동일하게 앞뒤 일반 공백(U+0020)만 제거한다.
    public static String trimSpaces(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && value.charAt(start) == ' ') {
            start++;
        }
        while (end > start && value.charAt(end - 1) == ' ') {
            end--;
        }
        return value.substring(start, end);
    }
}
