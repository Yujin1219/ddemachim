package com.ddemachim.server.domain.event.enums;

import com.ddemachim.server.domain.event.exception.InvalidEventStatusException;
import java.util.Locale;

public enum EventStatus {
    ONGOING,
    ENDED;

    public static EventStatus from(String value) {
        if (value == null) {
            return null;
        }

        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new InvalidEventStatusException();
        }
    }
}
