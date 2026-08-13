package jumin.domain.parking.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import jumin.global.entity.BaseEntity;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Table(name = "parking_lots")
@Entity
@Getter
@NoArgsConstructor
public class ParkingLot extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id; // 기본 키

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 30)
    private ParkingDataSource source; // 데이터 제공처

    @Column(name = "source_external_id", nullable = false, length = 40)
    private String sourceExternalId; // 제공처의 주차장 관리 ID

    @Column(name = "name", nullable = false, length = 100)
    private String name; // 주차장명

    @Column(name = "sido", length = 30)
    private String sido; // 시도

    @Column(name = "sigungu", length = 30)
    private String sigungu; // 시군구

    @Column(name = "address", length = 255)
    private String address; // 주차장 주소

    @Column(name = "latitude")
    private Double latitude; // 주차장 입구 위도

    @Column(name = "longitude")
    private Double longitude; // 주차장 입구 경도

    @Column(name = "capacity")
    private Integer capacity; // 총 주차 구획 수

    @Column(name = "active", nullable = false)
    private boolean isActive = true; // 서비스 사용 여부

    @Column(name = "source_checked_at", nullable = false)
    private Instant sourceCheckedAt; // 원천 데이터 확인 시각
}
