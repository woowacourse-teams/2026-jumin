package jumin.domain.parking.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jumin.global.entity.BaseEntity;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Table(name = "parking_reviews")
@Entity
@Getter
@NoArgsConstructor
public class ParkingLotReview extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "detail", length = 500)
    private String detail;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
        name = "parking_lot_id",
        nullable = false,
        foreignKey = @ForeignKey(name = "fk_parking_reviews_parking_lot")
    )
    private ParkingLot parkingLot;

    public ParkingLotReview(ParkingLot parkingLot, String detail) {
        this.parkingLot = parkingLot;
        this.detail = detail;
    }

}
