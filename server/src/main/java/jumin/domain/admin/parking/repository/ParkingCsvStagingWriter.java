package jumin.domain.admin.parking.repository;

import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetEncoder;
import java.nio.charset.CoderResult;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import jumin.domain.admin.parking.model.ParkingCsvKey;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingLotValues;
import jumin.domain.admin.parking.model.ParkingOperationValues;
import jumin.domain.admin.parking.model.ParkingScheduleValues;
import org.postgresql.PGConnection;
import org.postgresql.copy.CopyIn;
import org.postgresql.copy.PGCopyOutputStream;

final class ParkingCsvStagingWriter {

    private static final byte[] HEADER = {'P', 'G', 'C', 'O', 'P', 'Y', '\n', (byte) 0xff, '\r', '\n', 0};
    private static final int BUFFER_SIZE = 8 * 1024;
    private static final int TEXT_CHARACTERS = 1024;
    private static final long POSTGRES_EPOCH_SECONDS = 946_684_800L;
    private static final long MICROS_PER_SECOND = 1_000_000L;
    private static final Instant MIN_DRIVER_TIMESTAMP = Instant.parse("-4712-01-01T00:00:00Z");

    private final DataOutputStream output;
    private final CharsetEncoder encoder = StandardCharsets.UTF_8.newEncoder()
            .onMalformedInput(CodingErrorAction.REPLACE)
            .onUnmappableCharacter(CodingErrorAction.REPLACE);
    private final CharBuffer characters = CharBuffer.allocate(TEXT_CHARACTERS);
    private final ByteBuffer encoded = ByteBuffer.allocate(TEXT_CHARACTERS * 3);

    private ParkingCsvStagingWriter(DataOutputStream output) {
        this.output = output;
    }

    static void copyRows(Connection connection, String sql, List<ParkingCsvRow> rows) throws SQLException {
        copy(connection, sql, rows, 36, ParkingCsvStagingWriter::writeRow);
    }

    static void copyKeys(Connection connection, String sql, List<ParkingCsvKey> keys) throws SQLException {
        copy(connection, sql, keys, 3, ParkingCsvStagingWriter::writeKey);
    }

    private static <T> void copy(
            Connection connection,
            String sql,
            List<T> rows,
            int fieldCount,
            RowWriter<T> writer
    ) throws SQLException {
        CopyIn operation = connection.unwrap(PGConnection.class).getCopyAPI().copyIn(sql);
        try {
            if (operation.getFormat() != 1 || operation.getFieldCount() != fieldCount) {
                throw new IllegalStateException("CSV 임시 저장 열 형식이 예상과 다릅니다.");
            }
            PGCopyOutputStream copy = new PGCopyOutputStream(operation, BUFFER_SIZE);
            DataOutputStream output = new DataOutputStream(copy);
            ParkingCsvStagingWriter staging = new ParkingCsvStagingWriter(output);
            output.write(HEADER);
            output.writeInt(0);
            output.writeInt(0);
            for (T row : rows) {
                output.writeShort(fieldCount);
                writer.write(staging, row);
            }
            output.writeShort(-1);
            if (copy.endCopy() != rows.size()) {
                throw new IllegalStateException("CSV 임시 저장 건수가 요청한 건수와 다릅니다.");
            }
        } catch (IOException exception) {
            SQLException failure = sqlException(exception);
            cancel(operation, failure);
            throw failure;
        } catch (SQLException | RuntimeException | Error exception) {
            cancel(operation, exception);
            throw exception;
        }
    }

    private static SQLException sqlException(IOException exception) {
        if (exception.getCause() instanceof SQLException sqlException) {
            return sqlException;
        }
        return new SQLException("CSV 임시 저장 데이터를 전송할 수 없습니다.", exception);
    }

    private static void cancel(CopyIn operation, Throwable failure) {
        if (!operation.isActive()) {
            return;
        }
        try {
            operation.cancelCopy();
        } catch (SQLException | RuntimeException | Error cleanupFailure) {
            if (cleanupFailure != failure) {
                failure.addSuppressed(cleanupFailure);
            }
        }
    }

    private void writeRow(ParkingCsvRow row) throws IOException {
        writeLong(row.rowNumber());
        writeLong(row.rowNumber());
        writeLot(row.lot());
        writeLong(row.rowNumber());
        writeOperation(row.operation());
    }

    private void writeKey(ParkingCsvKey key) throws IOException {
        writeLong(key.rowNumber());
        writeText(key.key().name());
        writeText(key.key().address());
    }

    private void writeLot(ParkingLotValues lot) throws IOException {
        writeText(lot.source().name());
        writeText(lot.sourceExternalId());
        writeText(lot.name());
        writeText(lot.sido());
        writeText(lot.sigungu());
        writeText(lot.address());
        writeDouble(lot.latitude());
        writeDouble(lot.longitude());
        writeInteger(lot.capacity());
        writeBoolean(lot.mechanical());
        writeBoolean(lot.isPublic());
        writeBoolean(lot.active());
        writeInstant(lot.sourceCheckedAt());
    }

    private void writeOperation(ParkingOperationValues operation) throws IOException {
        writeInteger(operation.baseFreeMinutes());
        writeInteger(operation.baseMinutes());
        writeInteger(operation.baseFee());
        writeInteger(operation.additionalMinutes());
        writeInteger(operation.additionalFee());
        writeInteger(operation.dailyMaxFee());
        writeInteger(operation.monthlyFee());
        writeBoolean(operation.weekdayPaid());
        writeBoolean(operation.saturdayPaid());
        writeBoolean(operation.holidayPaid());
        writeSchedule(operation.weekday());
        writeSchedule(operation.weekend());
        writeSchedule(operation.holiday());
        writeInstant(operation.sourceCheckedAt());
    }

    private void writeSchedule(ParkingScheduleValues schedule) throws IOException {
        String status = null;
        if (schedule.status() != null) {
            status = schedule.status().name();
        }
        writeText(status);
        writeTime(schedule.openTime());
        writeTime(schedule.closeTime());
    }

    private void writeText(String value) throws IOException {
        if (value == null) {
            output.writeInt(-1);
            return;
        }
        int length = encodeText(value, false);
        output.writeInt(length);
        if (value.length() <= TEXT_CHARACTERS) {
            output.write(encoded.array(), 0, length);
            return;
        }
        // COPY는 필드 길이가 먼저 필요하므로 큰 값만 고정 크기 버퍼로 두 번 순회한다.
        encodeText(value, true);
    }

    private int encodeText(String value, boolean write) throws IOException {
        encoder.reset();
        characters.clear();
        characters.limit(0);
        int offset = 0;
        int length = 0;
        boolean complete;
        do {
            // 버퍼 끝에 걸친 surrogate는 다음 구간의 문자와 함께 인코딩한다.
            characters.compact();
            int count = Math.min(characters.remaining(), value.length() - offset);
            value.getChars(offset, offset + count, characters.array(), characters.position());
            characters.position(characters.position() + count);
            characters.flip();
            offset += count;
            complete = offset == value.length();
            encoded.clear();
            checkEncoding(encoder.encode(characters, encoded, complete));
            if (complete) {
                checkEncoding(encoder.flush(encoded));
            }
            length = Math.addExact(length, encoded.position());
            if (write) {
                output.write(encoded.array(), 0, encoded.position());
            }
        } while (!complete);
        return length;
    }

    private static void checkEncoding(CoderResult result) throws IOException {
        if (result.isError()) {
            result.throwException();
        }
        if (result.isOverflow()) {
            throw new IOException("CSV 문자열 인코딩 버퍼가 부족합니다.");
        }
    }

    private void writeLong(long value) throws IOException {
        output.writeInt(Long.BYTES);
        output.writeLong(value);
    }

    private void writeInteger(Integer value) throws IOException {
        if (value == null) {
            output.writeInt(-1);
            return;
        }
        output.writeInt(Integer.BYTES);
        output.writeInt(value);
    }

    private void writeDouble(Double value) throws IOException {
        if (value == null) {
            output.writeInt(-1);
            return;
        }
        output.writeInt(Double.BYTES);
        output.writeDouble(value);
    }

    private void writeBoolean(Boolean value) throws IOException {
        if (value == null) {
            output.writeInt(-1);
            return;
        }
        output.writeInt(1);
        output.writeBoolean(value);
    }

    private void writeTime(LocalTime value) throws IOException {
        if (value == null) {
            output.writeInt(-1);
            return;
        }
        // pgjdbc와 동일하게 마이크로초로 반올림하며 자정 직전 값은 24:00이 될 수 있다.
        writeLong((value.toNanoOfDay() + 500L) / 1000L);
    }

    private void writeInstant(Instant value) throws IOException {
        // pgjdbc의 OffsetDateTime 저장은 이 경계보다 이른 값을 음의 무한대로 변환한다.
        if (value.isBefore(MIN_DRIVER_TIMESTAMP)) {
            writeLong(Long.MIN_VALUE);
            return;
        }
        long seconds = Math.subtractExact(value.getEpochSecond(), POSTGRES_EPOCH_SECONDS);
        long micros = Math.addExact(
                Math.multiplyExact(seconds, MICROS_PER_SECOND), (value.getNano() + 500L) / 1000L
        );
        writeLong(micros);
    }

    @FunctionalInterface
    private interface RowWriter<T> {
        void write(ParkingCsvStagingWriter output, T row) throws IOException;
    }
}
