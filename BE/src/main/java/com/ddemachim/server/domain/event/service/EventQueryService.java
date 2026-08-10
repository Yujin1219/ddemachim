package com.ddemachim.server.domain.event.service;

import com.ddemachim.server.domain.event.dto.EventDetailResponse;
import com.ddemachim.server.domain.event.dto.EventSummaryResponse;
import com.ddemachim.server.domain.event.entity.Event;
import com.ddemachim.server.domain.event.exception.EventNotFoundException;
import com.ddemachim.server.domain.event.repository.EventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EventQueryService {

    private final EventRepository eventRepository;

    public Page<EventSummaryResponse> findEvents(String keyword, Pageable pageable) {
        return eventRepository.search(keyword, pageable).map(EventSummaryResponse::from);
    }

    public EventDetailResponse findEvent(Long id) {
        Event event = eventRepository.findById(id).orElseThrow(EventNotFoundException::new);
        return EventDetailResponse.from(event);
    }
}
