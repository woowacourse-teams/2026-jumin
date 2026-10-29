package jumin.domain.admin.parking.csv;

import java.util.List;
import jumin.domain.admin.parking.model.ParkingCsvKey;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingKey;

public interface ParkingCsvRowSink {

    void accept(ParkingCsvRow row);

    void registerKey(ParkingCsvKey key);

    default void registerKey(long rowNumber, String name, String address) {
        registerKey(new ParkingCsvKey(rowNumber, new ParkingKey(name, address)));
    }

    // 마지막 행과 키까지 반영한다. 완료되어도 CSV 검증이 실패할 수 있으므로 커밋하지 않는다.
    void finish();

    // finish() 이후 조회한다. 중복 키의 첫 등장 순서, 같은 키 안에서는 행 번호 순서로 반환한다.
    List<Long> findDuplicateRowNumbers();
}
