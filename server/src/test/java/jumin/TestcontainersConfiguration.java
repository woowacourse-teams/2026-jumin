package jumin;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean(destroyMethod = "stop")
    @ServiceConnection
    @SuppressWarnings("resource")
    PostgreSQLContainer postgresContainer() {
        DockerImageName image = DockerImageName.parse("pgrouting/pgrouting:18-3.6-3.8")
                .asCompatibleSubstituteFor("postgres");
        return new PostgreSQLContainer(image)
                .withDatabaseName("jumin")
                .withUsername("jumin")
                .withPassword("jumin")
                .withInitScript("db/init/01-enable-pgrouting.sql");
    }
}
