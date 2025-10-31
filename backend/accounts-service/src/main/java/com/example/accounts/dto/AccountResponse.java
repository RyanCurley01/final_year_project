package com.example.accounts.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for Account responses that excludes the password field
 * Used to safely return account information without exposing sensitive data
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AccountResponse {
    
    private Long id;
    private String accountName;
    private String accountPhoneNumber;
    private String accountEmailAddress;
    private String accountType;
    
    /**
     * Creates an AccountResponse from an Account entity
     * @param account The account entity to convert
     * @return AccountResponse DTO without password
     */
    public static AccountResponse fromAccount(com.example.accounts.model.Account account) {
        if (account == null) {
            return null;
        }
        return new AccountResponse(
            account.getId(),
            account.getAccountName(),
            account.getAccountPhoneNumber(),
            account.getAccountEmailAddress(),
            account.getAccountType()
        );
    }
}
