package jumin.domain.parking.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.EntityManager;
import jumin.TestcontainersConfiguration;
import jumin.config.JpaAuditingConfig;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingLotReview;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@ActiveProfiles("test")
@Import({TestcontainersConfiguration.class, JpaAuditingConfig.class})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
class ParkingLotReviewRepositoryTest {

    @Autowired
    private ParkingLotReviewRepository parkingLotReviewRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("제보 내용이 없어도 리뷰와 감사 시각을 DB에 저장한다")
    void saves_review_without_optional_detail() {
        ParkingLot parkingLot = parkingLot();

        ParkingLotReview review = parkingLotReviewRepository.saveAndFlush(
                new ParkingLotReview(parkingLot, null)
        );

        assertThat(review.getId()).isNotNull();
        assertThat(review.getDetail()).isNull();
        assertThat(review.getCreatedAt()).isNotNull();
        assertThat(review.getUpdatedAt()).isNotNull();
        assertThat(jdbcTemplate.queryForObject(
                "select parking_lot_id from parking_reviews where id = ?",
                Long.class,
                review.getId()
        )).isEqualTo(parkingLot.getId());
    }

    @Test
    @DisplayName("리뷰가 연결된 주차장은 하드딜리트할 수 없다")
    void prevents_hard_delete_of_parking_lot_with_review() {
        ParkingLot parkingLot = parkingLot();
        parkingLotReviewRepository.saveAndFlush(new ParkingLotReview(parkingLot, "정보가 달라요."));

        assertThatThrownBy(() -> jdbcTemplate.update(
                "delete from parking_lots where id = ?",
                parkingLot.getId()
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    private ParkingLot parkingLot() {
        Long parkingLotId = jdbcTemplate.queryForObject("""
                insert into parking_lots (
                    source, source_external_id, name, active,
                    source_checked_at, created_at, updated_at
                ) values (
                    'DATA_GO_KR', 'review-test', '제보 테스트 주차장', true,
                    current_timestamp, current_timestamp, current_timestamp
                )
                returning id
                """, Long.class);
        return entityManager.find(ParkingLot.class, parkingLotId);
    }
}
