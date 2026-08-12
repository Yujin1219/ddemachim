package com.ddemachim.server.domain.event.enums;

import com.ddemachim.server.domain.event.exception.InvalidEventSortModeException;
import java.util.Locale;

public enum EventSortMode {
    LATEST,
    NEAREST;

    public static EventSortMode from(String value) {
        if (value == null) {
            return null;
        }

        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new InvalidEventSortModeException();
        }
    }
}
