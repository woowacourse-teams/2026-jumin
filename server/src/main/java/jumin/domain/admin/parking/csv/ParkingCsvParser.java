package jumin.domain.admin.parking.csv;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingCsvFile;
import jumin.domain.admin.parking.model.ParkingCsvKey;
import jumin.domain.admin.parking.model.ParkingCsvMetadata;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingKey;
import jumin.domain.admin.parking.support.ParkingText;
import jumin.global.response.ValidationErrorField;
import org.apache.commons.csv.CSVException;
import org.apache.commons.io.ByteOrderMark;
import org.apache.commons.io.input.BOMInputStream;
import org.apache.commons.io.input.BoundedInputStream;
import org.apache.commons.io.input.CloseShieldReader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;
import org.springframework.web.multipart.MultipartFile;

@Component
public class ParkingCsvParser {

    private final long maxFileSizeBytes;

    public ParkingCsvParser(@Value("${spring.servlet.multipart.max-file-size}") String maxFileSize) {
        this.maxFileSizeBytes = DataSize.parse(maxFileSize).toBytes();
        if (maxFileSizeBytes <= 0 || maxFileSizeBytes >= Integer.MAX_VALUE) {
            throw new IllegalArgumentException(
                    "CSV 파일 크기 제한은 0보다 크고 %d바이트보다 작아야 합니다.".formatted(Integer.MAX_VALUE));
        }
    }

    public ParkingCsvFile parse(MultipartFile file) {
        CollectingRowSink sink = new CollectingRowSink();
        ParkingCsvMetadata metadata = parse(file, sink);
        return new ParkingCsvFile(metadata.fileName(), metadata.fileSha256(), sink.rows);
    }

    /**
     * 유효한 행을 읽는 즉시 sink로 전달하고 파일 전체 검증이 끝나면 메타데이터를 반환한다.
     * 뒤쪽 행이나 인코딩 검증이 실패할 수 있으므로 sink의 DB 쓰기는 호출자가 같은 트랜잭션으로 묶어야 한다.
     */
    public ParkingCsvMetadata parse(MultipartFile file, ParkingCsvRowSink sink) {
        validateFile(file);
        MessageDigest digest = createSha256();
        try (InputStream input = file.getInputStream()) {
            BoundedInputStream bounded = BoundedInputStream.builder()
                    .setInputStream(input)
                    .setMaxCount(maxFileSizeBytes + 1)
                    .setPropagateClose(false)
                    .get();
            DigestInputStream digested = new DigestInputStream(bounded, digest);
            int rowCount = readAndValidateRows(bounded, digested, sink);
            return new ParkingCsvMetadata(file.getOriginalFilename(), HexFormat.of().formatHex(digest.digest()), rowCount);
        } catch (IOException exception) {
            throw new ParkingCsvException(HttpStatus.INTERNAL_SERVER_ERROR, "업로드한 파일을 읽을 수 없습니다.", exception);
        }
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

    private int readAndValidateRows(BoundedInputStream bounded, DigestInputStream digested, ParkingCsvRowSink sink)
            throws IOException {
        BOMInputStream input = createBomInputStream(digested);
        try (Reader reader = new InputStreamReader(input, StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT))) {
            int rowCount = 0;
            ParkingCsvException validationFailure = null;
            try {
                if (input.hasBOM() && !input.hasBOM(ByteOrderMark.UTF_8)) {
                    throw unsupportedEncoding();
                }
                rowCount = readRowsAndRemainder(reader, sink);
            } catch (CharacterCodingException exception) {
                validationFailure = unsupportedEncoding();
            } catch (ParkingCsvException exception) {
                validationFailure = exception;
            }

            // CSV나 인코딩 오류가 있어도 실제 크기 초과를 먼저 확인한다.
            digested.transferTo(OutputStream.nullOutputStream());
            if (bounded.getCount() > maxFileSizeBytes) {
                throw tooLarge();
            }
            if (validationFailure != null) {
                throw validationFailure;
            }
            return rowCount;
        }
    }

    private int readRowsAndRemainder(Reader reader, ParkingCsvRowSink sink) throws IOException {
        int rowCount = 0;
        ParkingCsvException validationFailure = null;
        try {
            rowCount = readRows(CloseShieldReader.wrap(reader), sink);
        } catch (ParkingCsvException exception) {
            validationFailure = exception;
        }
        // CSV 검증이 먼저 실패해도 나머지 파일의 UTF-8 인코딩을 검사한다.
        reader.transferTo(Writer.nullWriter());
        if (validationFailure != null) {
            throw validationFailure;
        }
        return rowCount;
    }

    private BOMInputStream createBomInputStream(InputStream input) throws IOException {
        return BOMInputStream.builder()
                .setInputStream(input)
                .setByteOrderMarks(ByteOrderMark.UTF_8, ByteOrderMark.UTF_16LE, ByteOrderMark.UTF_16BE,
                        ByteOrderMark.UTF_32LE, ByteOrderMark.UTF_32BE)
                .get();
    }

    private int readRows(Reader reader, ParkingCsvRowSink sink) throws IOException {
        List<ValidationErrorField> errors = new ArrayList<>();
        int rowCount = 0;
        long nextRecordNumber = 1;
        long dataRecordCount = 0;

        try (ParkingCsvRecordReader record = new ParkingCsvRecordReader(reader)) {
            if (!record.next()) {
                throw ParkingCsvException.invalid(List.of(ValidationErrorField.of("file", "CSV 헤더와 데이터 행이 필요합니다.")));
            }
            Map<ParkingCsvColumn, Integer> indexes = readHeaders(record);
            record.ignoreColumns(indexes.get(ParkingCsvColumn.LOT_ID),
                    indexes.get(ParkingCsvColumn.LOT_CREATED_AT), indexes.get(ParkingCsvColumn.LOT_UPDATED_AT),
                    indexes.get(ParkingCsvColumn.OPERATION_PARKING_LOT_ID),
                    indexes.get(ParkingCsvColumn.OPERATION_CREATED_AT),
                    indexes.get(ParkingCsvColumn.OPERATION_UPDATED_AT));
            record.deferColumns(indexes.get(ParkingCsvColumn.CAPACITY),
                    indexes.get(ParkingCsvColumn.BASE_FREE_MINUTES), indexes.get(ParkingCsvColumn.BASE_MINUTES),
                    indexes.get(ParkingCsvColumn.BASE_FEE), indexes.get(ParkingCsvColumn.ADDITIONAL_MINUTES),
                    indexes.get(ParkingCsvColumn.ADDITIONAL_FEE), indexes.get(ParkingCsvColumn.DAILY_MAX_FEE),
                    indexes.get(ParkingCsvColumn.MONTHLY_FEE), indexes.get(ParkingCsvColumn.WEEKDAY_OPEN_TIME),
                    indexes.get(ParkingCsvColumn.WEEKDAY_CLOSE_TIME), indexes.get(ParkingCsvColumn.WEEKEND_OPEN_TIME),
                    indexes.get(ParkingCsvColumn.WEEKEND_CLOSE_TIME), indexes.get(ParkingCsvColumn.HOLIDAY_OPEN_TIME),
                    indexes.get(ParkingCsvColumn.HOLIDAY_CLOSE_TIME), indexes.get(ParkingCsvColumn.LOT_SOURCE_CHECKED_AT),
                    indexes.get(ParkingCsvColumn.OPERATION_SOURCE_CHECKED_AT));
            int expectedColumnCount = ParkingCsvColumn.values().length;
            // 업로드마다 숫자와 시간 열의 직전 정상 변환값만 보관한다.
            ParkingCsvRowReader.ConversionCache conversionCache = new ParkingCsvRowReader.ConversionCache();
            ParkingCsvRowReader rowReader = new ParkingCsvRowReader(record, indexes, errors, conversionCache);
            nextRecordNumber = 2;
            while (record.next()) {
                dataRecordCount++;
                nextRecordNumber = record.getRecordNumber() + 1;
                collectKey(record, indexes, sink);
                if (record.size() != expectedColumnCount) {
                    errors.add(ValidationErrorField.of("rows[" + record.getRecordNumber() + "]",
                            "열 개수가 헤더의 %d개 열과 일치해야 합니다.".formatted(expectedColumnCount)));
                    continue;
                }
                ParkingCsvRow row = rowReader.read();
                if (row != null) {
                    sink.accept(row);
                    rowCount++;
                }
            }
            if (dataRecordCount == 0) {
                errors.add(ValidationErrorField.of("file", "헤더를 제외한 데이터 행이 한 건 이상 있어야 합니다."));
            }
        } catch (CSVException exception) {
            errors.add(ValidationErrorField.of("rows[" + nextRecordNumber + "]",
                    "CSV 구문을 읽을 수 없습니다. 따옴표와 열 구분자를 확인해주세요."));
        }

        sink.finish();
        collectDuplicateErrors(sink.findDuplicateRowNumbers(), errors);
        if (!errors.isEmpty()) {
            throw ParkingCsvException.invalid(errors);
        }
        return rowCount;
    }

    private Map<ParkingCsvColumn, Integer> readHeaders(ParkingCsvRecordReader header) {
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

    private void collectKey(ParkingCsvRecordReader record, Map<ParkingCsvColumn, Integer> indexes,
            ParkingCsvRowSink sink) {
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
        sink.registerKey(record.getRecordNumber(), name, address);
    }

    private void collectDuplicateErrors(List<Long> duplicateRowNumbers, List<ValidationErrorField> errors) {
        for (Long rowNumber : duplicateRowNumbers) {
            errors.add(ValidationErrorField.of("rows[" + rowNumber + "].parking_lots.name",
                    "이름과 주소가 같은 주차장이 CSV에 중복되어 있습니다."));
        }
    }

    private MessageDigest createSha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
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

    private static final class CollectingRowSink implements ParkingCsvRowSink {

        private final List<ParkingCsvRow> rows = new ArrayList<>();
        private final Map<ParkingKey, List<Long>> keyRows = new LinkedHashMap<>();

        @Override
        public void accept(ParkingCsvRow row) {
            rows.add(row);
        }

        @Override
        public void registerKey(ParkingCsvKey key) {
            keyRows.computeIfAbsent(key.key(), ignored -> new ArrayList<>()).add(key.rowNumber());
        }

        @Override
        public void finish() {
            // accept와 registerKey에서 즉시 수집하므로 남은 버퍼가 없다.
        }

        @Override
        public List<Long> findDuplicateRowNumbers() {
            List<Long> duplicateRowNumbers = new ArrayList<>();
            for (List<Long> rowNumbers : keyRows.values()) {
                if (rowNumbers.size() > 1) {
                    duplicateRowNumbers.addAll(rowNumbers);
                }
            }
            return duplicateRowNumbers;
        }
    }
}
