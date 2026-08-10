package jumin;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {

	@Bean(destroyMethod = "stop")
	@ServiceConnection
	@SuppressWarnings("resource")
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer("postgres:18.4-alpine")
				.withDatabaseName("jumin")
				.withUsername("jumin")
				.withPassword("jumin");
	}
}
