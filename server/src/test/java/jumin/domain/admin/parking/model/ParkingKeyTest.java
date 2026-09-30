package jumin.domain.admin.parking.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ParkingKeyTest {

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "   "})
    void treatsNullEmptyAndOrdinarySpacesAsTheSameKey(String value) {
        // when
        ParkingKey key = new ParkingKey(value, value);

        // then
        assertThat(key).isEqualTo(new ParkingKey(null, null));
    }

    @Test
    void trimsEdgesAndPreservesInternalSpaces() {
        // when
        ParkingKey key = new ParkingKey("  공영 주차장  ", "  서울  강남구  ");

        // then
        assertThat(key.name()).isEqualTo("공영 주차장");
        assertThat(key.address()).isEqualTo("서울  강남구");
    }

    @ParameterizedTest
    @ValueSource(strings = {"\t", "\u2003", "\u00a0"})
    void preservesOtherWhitespaceToMatchDatabaseKeys(String whitespace) {
        // given
        String value = " " + whitespace + " ";

        // when
        ParkingKey key = new ParkingKey(value, value);

        // then
        assertThat(key.name()).isEqualTo(whitespace);
        assertThat(key.address()).isEqualTo(whitespace);
        assertThat(key).isNotEqualTo(new ParkingKey(null, null));
    }
}
