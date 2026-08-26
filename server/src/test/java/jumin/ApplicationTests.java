package jumin;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ApplicationTests {

    @Test
    @DisplayName("애플리케이션 컨텍스트가 정상적으로 로드된다")
    void contextLoads() {
    }
}
