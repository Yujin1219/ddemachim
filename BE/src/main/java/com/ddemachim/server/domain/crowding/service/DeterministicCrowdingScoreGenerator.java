package com.ddemachim.server.domain.crowding.service;

import com.ddemachim.server.global.properties.CrowdingMockProperties;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Objects;
import org.springframework.stereotype.Service;

@Service
public class DeterministicCrowdingScoreGenerator {

    private static final String VERSION = "v1";
    private static final BigInteger SCORE_RANGE = BigInteger.valueOf(100);
    private static final DateTimeFormatter SLOT_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd|HH:mm", Locale.ROOT);

    private final String seed;
    private final ZoneId zoneId;

    public DeterministicCrowdingScoreGenerator(CrowdingMockProperties properties) {
        this.seed = Objects.requireNonNull(properties.getSeed());
        this.zoneId = properties.zoneId();
    }

    public int generate(String gridCode, OffsetDateTime slotStart) {
        String digestInput = seed
                + "|" + VERSION
                + "|" + Objects.requireNonNull(gridCode)
                + "|" + SLOT_FORMATTER.format(Objects.requireNonNull(slotStart).atZoneSameInstant(zoneId));
        byte[] digest = sha256(digestInput);
        return new BigInteger(1, digest).mod(SCORE_RANGE).intValue() + 1;
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
