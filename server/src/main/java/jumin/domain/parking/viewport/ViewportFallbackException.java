package jumin.domain.parking.viewport;

public class ViewportFallbackException extends RuntimeException {

    private final boolean cellTooLarge;

    private ViewportFallbackException(boolean cellTooLarge) {
        this.cellTooLarge = cellTooLarge;
    }

    public static ViewportFallbackException mappingUnavailable() {
        return new ViewportFallbackException(false);
    }

    public static ViewportFallbackException cellTooLarge() {
        return new ViewportFallbackException(true);
    }

    public boolean isCellTooLarge() {
        return cellTooLarge;
    }
}
