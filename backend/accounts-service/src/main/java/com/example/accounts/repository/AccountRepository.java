package com.example.accounts.repository;

import com.example.accounts.model.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AccountRepository extends JpaRepository<Account, Long> {
    
    List<Account> findByAccountType(String accountType);
    
    Optional<Account> findByAccountEmailAddress(String email);
    
    boolean existsByAccountEmailAddress(String email);
}
