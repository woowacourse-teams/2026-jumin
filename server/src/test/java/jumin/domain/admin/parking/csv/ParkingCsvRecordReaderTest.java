package jumin.domain.admin.parking.csv;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.io.Reader;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.stream.Stream;
import org.apache.commons.csv.CSVException;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

class ParkingCsvRecordReaderTest {

    private static final CSVFormat PREVIOUS_FORMAT = CSVFormat.RFC4180.builder()
            .setIgnoreEmptyLines(false)
            .setLenientEof(false)
            .setTrailingData(false)
            .get();

    @ParameterizedTest
    @MethodSource("boundaryInputs")
    @DisplayName("따옴표, 빈 필드, 줄바꿈과 입력 경계 처리는 기존 CSV 파서와 같다")
    void matchesExistingParserAtCsvBoundaries(String input) throws IOException {
        // when
        LexicalResult expected = readPrevious(input);
        LexicalResult actual = readCurrent(input);

        // then
        assertThat(actual).isEqualTo(expected);
    }

    @Test
    @DisplayName("짧은 CSV 문법 조합의 정상 레코드와 오류 위치는 기존 파서와 같다")
    void matchesExistingParserForDeterministicSyntaxCombinations() throws IOException {
        // given
        Random random = new Random(250_123);
        char[] alphabet = {'a', ',', '"', ' ', '\t', '\r', '\n', '\\', '\0', '\u2003', '한'};

        for (int attempt = 0; attempt < 10_000; attempt++) {
            int length = random.nextInt(100);
            StringBuilder input = new StringBuilder(length);
            for (int index = 0; index < length; index++) {
                input.append(alphabet[random.nextInt(alphabet.length)]);
            }
            String csv = input.toString();

            // when
            LexicalResult expected = readPrevious(csv);
            LexicalResult actual = readCurrent(csv);

            // then
            assertThat(actual).as("CSV combination %s", attempt).isEqualTo(expected);
        }
    }

    @Test
    @DisplayName("다음 레코드를 읽어도 이전 레코드에서 반환한 문자열은 유지된다")
    void keepsReturnedTextStableAcrossRecords() throws IOException {
        // given
        try (ParkingCsvRecordReader reader = new ParkingCsvRecordReader(new StringReader("한글,repeat\n바뀜,repeat\n"))) {
            reader.next();
            String first = reader.get(0);
            String repeated = reader.get(1);

            // when
            boolean hasNext = reader.next();

            // then
            assertThat(hasNext).isTrue();
            assertThat(first).isEqualTo("한글");
            assertThat(reader.get(0)).isEqualTo("바뀜");
            assertThat(reader.get(1)).isEqualTo(repeated);
            assertThat(reader.getRecordNumber()).isEqualTo(2);
        }
    }

    @Test
    @DisplayName("무시하는 열도 따옴표 문법은 검사한다")
    void checksSyntaxInIgnoredColumns() throws IOException {
        // given
        String input = "unused,value\n\"discard\"invalid,kept\n";
        try (ParkingCsvRecordReader reader = new ParkingCsvRecordReader(new StringReader(input))) {
            reader.next();
            reader.ignoreColumns(0);

            // when & then
            assertThrows(CSVException.class, reader::next);
        }
    }

    private LexicalResult readPrevious(String input) throws IOException {
        List<List<String>> records = new ArrayList<>();
        try (CSVParser parser = PREVIOUS_FORMAT.parse(new ChunkedReader(input))) {
            for (CSVRecord record : parser) {
                records.add(record.toList());
            }
            return new LexicalResult(records, false);
        } catch (UncheckedIOException exception) {
            if (!(exception.getCause() instanceof CSVException)) {
                throw exception.getCause();
            }
            return new LexicalResult(records, true);
        } catch (CSVException exception) {
            return new LexicalResult(records, true);
        }
    }

    private LexicalResult readCurrent(String input) throws IOException {
        List<List<String>> records = new ArrayList<>();
        try (ParkingCsvRecordReader reader = new ParkingCsvRecordReader(new ChunkedReader(input))) {
            while (reader.next()) {
                List<String> record = new ArrayList<>();
                for (int index = 0; index < reader.size(); index++) {
                    record.add(reader.get(index));
                }
                records.add(record);
            }
            return new LexicalResult(records, false);
        } catch (CSVException exception) {
            return new LexicalResult(records, true);
        }
    }

    private static Stream<String> boundaryInputs() {
        return Stream.of("", "\n", "\r", "\r\n", "\n\n", ",", ",,", "a,", "a,\n", "a\r\nb\rc\n",
                "\"\"", "\"\",", "\"a,b\",c", "\"a\r\nb\"\n", "\"a\"\"b\",c", "a\"b,c",
                " \"a\",b", "\"a\" \t\u2003,b", "\"a\"x,b", "\"a", "\"a\"\"", "\"\"\"\"",
                "\"\0한글😀\",x\n", "a\u0085b,c\n", "\"a\"\u00a0,b", "a,b\r\n\r\n", "\"a\"\r\n,b",
                "x".repeat(20_000) + ",\"" + "한".repeat(20_000) + "\"\r\n");
    }

    private record LexicalResult(List<List<String>> records, boolean syntaxError) {
    }

    private static final class ChunkedReader extends Reader {

        private final StringReader delegate;
        private int nextChunkSize = 1;

        private ChunkedReader(String input) {
            this.delegate = new StringReader(input);
        }

        @Override
        public int read(char[] buffer, int offset, int length) throws IOException {
            int count = delegate.read(buffer, offset, Math.min(length, nextChunkSize));
            nextChunkSize = nextChunkSize % 7 + 1;
            return count;
        }

        @Override
        public void close() {
            delegate.close();
        }
    }
}
