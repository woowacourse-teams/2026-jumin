package jumin.domain.admin.parking.csv;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingCsvFile;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingKey;
import jumin.domain.admin.parking.support.ParkingText;
import jumin.global.response.ValidationErrorField;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.commons.io.ByteOrderMark;
import org.apache.commons.io.input.BOMInputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;
import org.springframework.web.multipart.MultipartFile;

@Component
public class ParkingCsvParser {

    private static final CSVFormat FORMAT = CSVFormat.RFC4180.builder()
            .setIgnoreEmptyLines(false)
            .setLenientEof(false)
            .setTrailingData(false)
            .get();

    private final long maxFileSizeBytes;

    public ParkingCsvParser(@Value("${spring.servlet.multipart.max-file-size}") String maxFileSize) {
        this.maxFileSizeBytes = DataSize.parse(maxFileSize).toBytes();
        if (maxFileSizeBytes <= 0 || maxFileSizeBytes >= Integer.MAX_VALUE) {
            throw new IllegalArgumentException(
                    "CSV 파일 크기 제한은 0보다 크고 %d바이트보다 작아야 합니다.".formatted(Integer.MAX_VALUE));
        }
    }

    public ParkingCsvFile parse(MultipartFile file) {
        validateFile(file);
        byte[] bytes = readBytes(file);
        String content = decode(bytes);
        List<ParkingCsvRow> rows = readRows(content);
        return new ParkingCsvFile(file.getOriginalFilename(), sha256(bytes), rows);
    }

    private void validateFile(MultipartFile file) {
        if (file == null) {
            throw new ParkingCsvException(HttpStatus.BAD_REQUEST, "CSV 파일은 필수입니다.");
        }
        if (file.getSize() > maxFileSizeBytes) {
            throw tooLarge();
        }
        String fileName = file.getOriginalFilename();
        if (fileName == null || !fileName.toLowerCase(Locale.ROOT).endsWith(".csv")) {
            throw new ParkingCsvException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "CSV 파일만 업로드할 수 있습니다.");
        }
    }

    private byte[] readBytes(MultipartFile file) {
        try (InputStream input = file.getInputStream()) {
            byte[] bytes = input.readNBytes((int) maxFileSizeBytes + 1);
            if (bytes.length > maxFileSizeBytes) {
                throw tooLarge();
            }
            return bytes;
        } catch (IOException exception) {
            throw new ParkingCsvException(HttpStatus.INTERNAL_SERVER_ERROR, "업로드한 파일을 읽을 수 없습니다.", exception);
        }
    }

    private String decode(byte[] bytes) {
        try (BOMInputStream input = BOMInputStream.builder()
                .setInputStream(new ByteArrayInputStream(bytes))
                .setByteOrderMarks(ByteOrderMark.UTF_8, ByteOrderMark.UTF_16LE, ByteOrderMark.UTF_16BE,
                        ByteOrderMark.UTF_32LE, ByteOrderMark.UTF_32BE)
                .get()) {
            if (input.hasBOM() && !input.hasBOM(ByteOrderMark.UTF_8)) {
                throw unsupportedEncoding();
            }
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(input.readAllBytes()))
                    .toString();
        } catch (CharacterCodingException exception) {
            throw unsupportedEncoding();
        } catch (IOException exception) {
            throw new ParkingCsvException(HttpStatus.INTERNAL_SERVER_ERROR, "업로드한 파일을 읽을 수 없습니다.", exception);
        }
    }

    private List<ParkingCsvRow> readRows(String content) {
        List<ValidationErrorField> errors = new ArrayList<>();
        List<ParkingCsvRow> rows = new ArrayList<>();
        Map<ParkingKey, List<Long>> keyRows = new LinkedHashMap<>();
        long nextRecordNumber = 1;
        long dataRecordCount = 0;

        try (CSVParser csv = FORMAT.parse(new StringReader(content))) {
            Iterator<CSVRecord> records = csv.iterator();
            if (!records.hasNext()) {
                throw ParkingCsvException.invalid(List.of(ValidationErrorField.of("file", "CSV 헤더와 데이터 행이 필요합니다.")));
            }
            Map<ParkingCsvColumn, Integer> indexes = readHeaders(records.next());
            int expectedColumnCount = ParkingCsvColumn.values().length;
            nextRecordNumber = 2;
            while (records.hasNext()) {
                CSVRecord record = records.next();
                dataRecordCount++;
                nextRecordNumber = record.getRecordNumber() + 1;
                collectKey(record, indexes, keyRows);
                if (record.size() != expectedColumnCount) {
                    errors.add(ValidationErrorField.of("rows[" + record.getRecordNumber() + "]",
                            "열 개수가 헤더의 %d개 열과 일치해야 합니다.".formatted(expectedColumnCount)));
                    continue;
                }
                ParkingCsvRow row = new ParkingCsvRowReader(record, indexes, errors).read();
                if (row != null) {
                    rows.add(row);
                }
            }
            if (dataRecordCount == 0) {
                errors.add(ValidationErrorField.of("file", "헤더를 제외한 데이터 행이 한 건 이상 있어야 합니다."));
            }
        } catch (IOException | UncheckedIOException exception) {
            errors.add(ValidationErrorField.of("rows[" + nextRecordNumber + "]",
                    "CSV 구문을 읽을 수 없습니다. 따옴표와 열 구분자를 확인해주세요."));
        }

        collectDuplicateErrors(keyRows, errors);
        if (!errors.isEmpty()) {
            throw ParkingCsvException.invalid(errors);
        }
        return List.copyOf(rows);
    }

    private Map<ParkingCsvColumn, Integer> readHeaders(CSVRecord header) {
        Map<String, Integer> firstIndexes = new LinkedHashMap<>();
        List<ValidationErrorField> errors = new ArrayList<>();
        List<String> expectedHeaders = ParkingCsvColumn.headers();
        for (int index = 0; index < header.size(); index++) {
            String value = header.get(index);
            if (firstIndexes.putIfAbsent(value, index) != null) {
                errors.add(ValidationErrorField.of("headers[" + (index + 1) + "]", "중복된 헤더입니다: " + value));
            }
            if (!expectedHeaders.contains(value)) {
                errors.add(ValidationErrorField.of("headers[" + (index + 1) + "]", "정의되지 않은 헤더입니다: " + value));
            }
        }

        Map<ParkingCsvColumn, Integer> indexes = new EnumMap<>(ParkingCsvColumn.class);
        for (ParkingCsvColumn column : ParkingCsvColumn.values()) {
            Integer index = firstIndexes.get(column.header());
            if (index == null) {
                errors.add(ValidationErrorField.of("headers." + column.header(), "필수 헤더가 없습니다."));
                continue;
            }
            indexes.put(column, index);
        }
        if (!errors.isEmpty()) {
            throw ParkingCsvException.invalid(errors);
        }
        return indexes;
    }

    private void collectKey(CSVRecord record, Map<ParkingCsvColumn, Integer> indexes,
            Map<ParkingKey, List<Long>> keyRows) {
        int nameIndex = indexes.get(ParkingCsvColumn.NAME);
        int addressIndex = indexes.get(ParkingCsvColumn.ADDRESS);
        if (record.size() <= Math.max(nameIndex, addressIndex)) {
            return;
        }
        String name = ParkingText.trimSpaces(record.get(nameIndex));
        String address = ParkingText.trimSpaces(record.get(addressIndex));
        if (name.isEmpty() || address.isEmpty()) {
            return;
        }
        keyRows.computeIfAbsent(new ParkingKey(name, address), ignored -> new ArrayList<>())
                .add(record.getRecordNumber());
    }

    private void collectDuplicateErrors(Map<ParkingKey, List<Long>> keyRows, List<ValidationErrorField> errors) {
        for (List<Long> duplicates : keyRows.values()) {
            if (duplicates.size() < 2) {
                continue;
            }
            for (Long rowNumber : duplicates) {
                errors.add(ValidationErrorField.of("rows[" + rowNumber + "].parking_lots.name",
                        "이름과 주소가 같은 주차장이 CSV에 중복되어 있습니다."));
            }
        }
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", exception);
        }
    }

    private ParkingCsvException tooLarge() {
        return new ParkingCsvException(HttpStatus.PAYLOAD_TOO_LARGE,
                "CSV 파일은 최대 %s까지 업로드할 수 있습니다.".formatted(formatMaxFileSize()));
    }

    private String formatMaxFileSize() {
        long bytesPerMebibyte = DataSize.ofMegabytes(1).toBytes();
        if (maxFileSizeBytes % bytesPerMebibyte == 0) {
            return maxFileSizeBytes / bytesPerMebibyte + "MiB";
        }
        long bytesPerKibibyte = DataSize.ofKilobytes(1).toBytes();
        if (maxFileSizeBytes % bytesPerKibibyte == 0) {
            return maxFileSizeBytes / bytesPerKibibyte + "KiB";
        }
        return maxFileSizeBytes + "바이트";
    }

    private ParkingCsvException unsupportedEncoding() {
        return new ParkingCsvException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UTF-8 또는 UTF-8 BOM 인코딩만 지원합니다.");
    }
}
