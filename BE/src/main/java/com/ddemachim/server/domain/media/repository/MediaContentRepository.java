package com.ddemachim.server.domain.media.repository;

import com.ddemachim.server.domain.media.entity.MediaContent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MediaContentRepository extends JpaRepository<MediaContent, Long> {}
