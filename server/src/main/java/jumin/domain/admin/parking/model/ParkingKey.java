package jumin.domain.admin.parking.model;

import jumin.domain.admin.parking.support.ParkingText;

public record ParkingKey(String name, String address) {

    public ParkingKey {
        name = normalize(name);
        address = normalize(address);
    }

    public static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = ParkingText.trimSpaces(value);
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed;
    }
}
