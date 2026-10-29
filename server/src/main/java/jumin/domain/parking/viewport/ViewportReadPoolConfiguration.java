package jumin.domain.parking.viewport;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Properties;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import jumin.config.ViewportCacheProperties;
import org.postgresql.Driver;

final class ViewportReadPoolConfiguration {

    private static final Set<String> OVERRIDDEN = Set.of("user", "password", "options", "sockettimeout",
            "connecttimeout", "cancelsignaltimeout", "applicationname", "targetservertype", "logintimeout");

    private ViewportReadPoolConfiguration() {
    }

    static HikariConfig create(HikariDataSource primary, ViewportCacheProperties properties) {
        HikariConfig config = new HikariConfig();
        Properties driver = new Properties();
        driver.putAll(primary.getDataSourceProperties());
        Properties effective = Driver.parseURL(primary.getJdbcUrl(), driver);
        if (effective == null) {
            throw new IllegalArgumentException("viewport 읽기 pool에는 PostgreSQL JDBC URL이 필요합니다.");
        }
        driver = new Properties();
        driver.putAll(effective);
        String primaryOptions = driver.getProperty("options", "");
        driver.keySet().removeIf(key -> OVERRIDDEN.contains(key.toString().toLowerCase(Locale.ROOT)));
        config.setJdbcUrl(removeOverrides(primary.getJdbcUrl()));
        config.setDataSourceProperties(driver);
        config.setUsername(properties.getReadUsername() == null ? primary.getUsername() : properties.getReadUsername());
        config.setPassword(properties.getReadPassword() == null ? primary.getPassword() : properties.getReadPassword());
        config.setPoolName("viewport-read");
        config.setMinimumIdle(0);
        config.setMaximumPoolSize(properties.getMaxConcurrentDb());
        config.setConnectionTimeout(1000);
        config.setValidationTimeout(250);
        config.setInitializationFailTimeout(-1);
        config.setReadOnly(true);
        long dbMillis = Math.max(1, properties.getDbTimeout().toMillis());
        config.addDataSourceProperty("options", primaryOptions + " -c statement_timeout=" + dbMillis
                + " -c lock_timeout=" + Math.max(1, dbMillis / 2)
                + " -c idle_in_transaction_session_timeout=" + dbMillis + " -c idle_session_timeout=5000");
        config.addDataSourceProperty("ApplicationName", "jumin-viewport-read");
        config.addDataSourceProperty("targetServerType", "primary");
        config.addDataSourceProperty("connectTimeout", "1");
        config.addDataSourceProperty("loginTimeout", "0");
        config.addDataSourceProperty("cancelSignalTimeout", "1");
        config.addDataSourceProperty("socketTimeout", Long.toString(Math.max(1, (dbMillis + 999) / 1000 + 1)));
        String init = primary.getConnectionInitSql();
        config.setConnectionInitSql((init == null || init.isBlank() ? "" : init + "; ")
                + "SET statement_timeout=" + dbMillis + "; SET lock_timeout=" + Math.max(1, dbMillis / 2)
                + "; SET idle_in_transaction_session_timeout=" + dbMillis
                + "; SET idle_session_timeout=5000; SET application_name='jumin-viewport-read'");
        return config;
    }

    static HikariConfig observer(HikariDataSource primary, ViewportCacheProperties properties) {
        HikariConfig config = create(primary, properties);
        config.setUsername(properties.getObserverUsername() == null ? primary.getUsername() : properties.getObserverUsername());
        config.setPassword(properties.getObserverPassword() == null ? primary.getPassword() : properties.getObserverPassword());
        config.setPoolName("viewport-observer");
        config.setConnectionTimeout(250);
        config.setMaximumPoolSize(1);
        return config;
    }

    private static String removeOverrides(String url) {
        int separator = url.indexOf('?');
        if (separator < 0) {
            return url;
        }
        String query = Arrays.stream(url.substring(separator + 1).split("&"))
                .filter(part -> !OVERRIDDEN.contains(URLDecoder.decode(part.split("=", 2)[0], StandardCharsets.UTF_8)
                        .toLowerCase(Locale.ROOT)))
                .collect(Collectors.joining("&"));
        return url.substring(0, separator) + (query.isEmpty() ? "" : "?" + query);
    }
}
