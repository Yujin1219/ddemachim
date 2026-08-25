package com.ddemachim.server.domain.course.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.course.dto.AddKakaoPlaceRequest;
import com.ddemachim.server.domain.course.dto.CourseBasketItemResponse;
import com.ddemachim.server.domain.course.enums.CourseBasketItemSource;
import com.ddemachim.server.domain.course.service.CourseBasketService;
import com.ddemachim.server.global.apiPayload.exception.ExceptionAdvice;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class CourseBasketControllerTest {

    @Mock
    private CourseBasketService courseBasketService;

    private CourseBasketController courseBasketController;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        courseBasketController = new CourseBasketController(courseBasketService);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(3L, null, List.of()));
        mockMvc = MockMvcBuilders.standaloneSetup(courseBasketController)
                .setControllerAdvice(new ExceptionAdvice())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listPlaces_returnsOkWithBasketItems() {
        CourseBasketItemResponse item = item();
        when(courseBasketService.listPlaces(3L)).thenReturn(List.of(item));

        var response = courseBasketController.listPlaces(3L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getResult()).containsExactly(item);
    }

    @Test
    void addPlace_returnsCreatedForNewBasketItem() {
        CourseBasketItemResponse item = item();
        when(courseBasketService.addPlace(3L, 40L, null))
                .thenReturn(new CourseBasketService.AddResult(item, true));

        var response = courseBasketController.addPlace(3L, 40L, null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().getResult()).isEqualTo(item);
    }

    @Test
    void addPlace_returnsOkForExistingBasketItem() {
        CourseBasketItemResponse item = item();
        when(courseBasketService.addPlace(3L, 40L, null))
                .thenReturn(new CourseBasketService.AddResult(item, false));

        var response = courseBasketController.addPlace(3L, 40L, null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getResult()).isEqualTo(item);
    }

    @Test
    void addKakaoPlace_returnsCreatedForNewBasketItem() throws Exception {
        CourseBasketItemResponse item = kakaoItem();
        when(courseBasketService.addKakaoPlace(eq(3L), any(AddKakaoPlaceRequest.class)))
                .thenReturn(new CourseBasketService.AddResult(item, true));

        mockMvc.perform(post("/api/course-basket/kakao-places")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validKakaoRequestJson()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.result.source").value("KAKAO"))
                .andExpect(jsonPath("$.result.placeId").doesNotExist())
                .andExpect(jsonPath("$.result.userPlaceId").value(50))
                .andExpect(jsonPath("$.result.providerPlaceId").value("27560651"))
                .andExpect(jsonPath("$.result.placeUrl").value("https://place.map.kakao.com/27560651"));
    }

    @Test
    void addKakaoPlace_returnsOkForExistingBasketItem() throws Exception {
        CourseBasketItemResponse item = kakaoItem();
        when(courseBasketService.addKakaoPlace(eq(3L), any(AddKakaoPlaceRequest.class)))
                .thenReturn(new CourseBasketService.AddResult(item, false));

        mockMvc.perform(post("/api/course-basket/kakao-places")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validKakaoRequestJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.id").value(8));
    }

    @Test
    void addKakaoPlace_rejectsMissingRequiredFields() throws Exception {
        mockMvc.perform(post("/api/course-basket/kakao-places")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON400"))
                .andExpect(jsonPath("$.result.providerPlaceId").exists())
                .andExpect(jsonPath("$.result.name").exists())
                .andExpect(jsonPath("$.result.longitude").exists())
                .andExpect(jsonPath("$.result.latitude").exists());

        verifyNoInteractions(courseBasketService);
    }

    @Test
    void addKakaoPlace_rejectsCoordinatesOutsideWorldBounds() throws Exception {
        mockMvc.perform(post("/api/course-basket/kakao-places")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerPlaceId": "27560651",
                                  "name": "경복궁",
                                  "longitude": 180.0001,
                                  "latitude": -90.0001
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.result.longitude").exists())
                .andExpect(jsonPath("$.result.latitude").exists());

        verifyNoInteractions(courseBasketService);
    }

    private static CourseBasketItemResponse item() {
        return new CourseBasketItemResponse(
                7L,
                40L,
                "운현궁",
                null,
                CourseBasketItemSource.DDEMACHIM,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                OffsetDateTime.parse("2026-08-12T12:00:00+09:00"));
    }

    private static CourseBasketItemResponse kakaoItem() {
        return new CourseBasketItemResponse(
                8L,
                null,
                "경복궁",
                null,
                CourseBasketItemSource.KAKAO,
                50L,
                "27560651",
                "여행 > 관광,명소 > 궁궐",
                "서울 종로구 사직로 161",
                "서울 종로구 세종로 1-1",
                126.976896737645,
                37.5776087830657,
                "02-3700-3900",
                "https://place.map.kakao.com/27560651",
                OffsetDateTime.parse("2026-08-12T12:00:00+09:00"));
    }

    private static String validKakaoRequestJson() {
        return """
                {
                  "providerPlaceId": "27560651",
                  "name": "경복궁",
                  "categoryName": "여행 > 관광,명소 > 궁궐",
                  "categoryGroupCode": "AT4",
                  "roadAddress": "서울 종로구 사직로 161",
                  "lotAddress": "서울 종로구 세종로 1-1",
                  "longitude": 126.976896737645,
                  "latitude": 37.5776087830657,
                  "phone": "02-3700-3900"
                }
                """;
    }
}
