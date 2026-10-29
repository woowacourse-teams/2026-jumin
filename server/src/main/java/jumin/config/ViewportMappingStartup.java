package jumin.config;

import jumin.domain.parking.viewport.ViewportWriteCoordinator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ViewportMappingStartup implements ApplicationRunner {

    private final ViewportCacheProperties properties;
    private final ViewportWriteCoordinator writer;

    @Override
    public void run(ApplicationArguments arguments) {
        if (properties.isEnabled() && properties.isPrepareOnStartup() && !properties.isProjectionOnly()) {
            try {
                writer.prepare();
            } catch (RuntimeException failure) {
                log.warn("viewport mapping 준비 실패: 원본 조회를 유지합니다.", failure);
            }
        }
    }
}
