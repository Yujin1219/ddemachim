package com.ddemachim.server.global.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI ddemachimOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("때마침 (ddemachim) API")
                        .description("서울 종로구 장소/촬영지/문화행사 조회 API. "
                                + "데이터 출처: RedTable, TourAPI(한국관광공사), 서울 열린데이터광장, TMDB.")
                        .version("v0.1"));
    }
}
