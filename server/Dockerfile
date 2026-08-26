FROM eclipse-temurin:21-jre-jammy

ENV TZ=Asia/Seoul \
    JAVA_TOOL_OPTIONS="-Duser.timezone=Asia/Seoul"

RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && useradd --system --uid 10001 --create-home appuser \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY app.jar /app/app.jar

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
