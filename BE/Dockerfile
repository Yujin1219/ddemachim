# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /app
COPY gradlew build.gradle settings.gradle ./
COPY gradle ./gradle
COPY src/main ./src/main
RUN --mount=type=cache,target=/root/.gradle \
    bash gradlew --no-daemon bootJar && \
    cp build/libs/*.jar /app/server.jar

FROM eclipse-temurin:21-jre-jammy AS runtime
WORKDIR /app
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app
COPY --from=build --chown=app:app /app/server.jar ./server.jar
ENV SERVER_PORT=8080 \
    SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/ddemachim \
    SPRING_DATASOURCE_USERNAME=postgres \
    REDIS_HOST=redis \
    REDIS_PORT=6379 \
    DATA_PIPELINE_SCHEDULER_ENABLED=false
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/server.jar"]
