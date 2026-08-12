package com.ddemachim.server.domain.course.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.dto.CourseBasketItemResponse;
import com.ddemachim.server.domain.course.service.CourseBasketService;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

@ExtendWith(MockitoExtension.class)
class CourseBasketControllerTest {

    @Mock
    private CourseBasketService courseBasketService;

    @InjectMocks
    private CourseBasketController courseBasketController;

    @Test
    void addPlace_returnsCreatedForNewBasketItem() {
        CourseBasketItemResponse item = item();
        when(courseBasketService.addPlace(3L, 40L))
                .thenReturn(new CourseBasketService.AddResult(item, true));

        var response = courseBasketController.addPlace(3L, 40L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().getResult()).isEqualTo(item);
    }

    @Test
    void addPlace_returnsOkForExistingBasketItem() {
        CourseBasketItemResponse item = item();
        when(courseBasketService.addPlace(3L, 40L))
                .thenReturn(new CourseBasketService.AddResult(item, false));

        var response = courseBasketController.addPlace(3L, 40L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getResult()).isEqualTo(item);
    }

    private static CourseBasketItemResponse item() {
        return new CourseBasketItemResponse(
                7L, 40L, "운현궁", OffsetDateTime.parse("2026-08-12T12:00:00+09:00"));
    }
}
