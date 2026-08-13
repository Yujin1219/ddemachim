package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.UserPlace;
import com.ddemachim.server.domain.place.enums.UserPlaceProvider;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPlaceRepository extends JpaRepository<UserPlace, Long> {

    Optional<UserPlace> findByMemberIdAndProviderAndProviderPlaceId(
            Long memberId, UserPlaceProvider provider, String providerPlaceId);
}
