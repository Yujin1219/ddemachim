package com.ddemachim.server.domain.media.repository;

import com.ddemachim.server.domain.media.entity.MediaCredit;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MediaCreditRepository extends JpaRepository<MediaCredit, Long> {

    /** 작품 크레딧을 인물과 함께 조회해 인물별 추가 조회(N+1)를 방지한다. */
    @Query("""
            select credit
            from MediaCredit credit
            join fetch credit.person
            where credit.mediaContent.id = :mediaContentId
            order by
                case when credit.role = com.ddemachim.server.domain.media.enums.MediaCreditRole.DIRECTOR then 0 else 1 end,
                case when credit.role = com.ddemachim.server.domain.media.enums.MediaCreditRole.CAST
                          and credit.castOrder is null then 1 else 0 end,
                credit.castOrder asc,
                credit.id asc
            """)
    List<MediaCredit> findByMediaContentIdWithPersonOrderByRoleAndCastOrder(
            @Param("mediaContentId") Long mediaContentId);
}
