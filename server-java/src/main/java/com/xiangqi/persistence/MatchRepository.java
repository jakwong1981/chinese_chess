package com.xiangqi.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MatchRepository extends JpaRepository<MatchEntity, String> {

    /** Newest first — same ordering as the Node mock's list endpoint. */
    List<MatchEntity> findAllByOrderBySavedAtDesc();
}
