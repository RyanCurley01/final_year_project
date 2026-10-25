package com.example.orders.config;

import com.example.orders.model.Order;
import com.example.orders.controller.OrderController;
import com.example.orders.repository.AccountRepository;
import com.example.orders.service.OrderService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(OrderController.class)
@Import(SecurityConfig.class)
class OrderSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private OrderService orderService;

    @MockitoBean
    private AccountRepository accountRepository;

    @Test
    void getOrderByIdIsPublic() throws Exception {
        Order order = new Order();
        order.setId(14L);
        when(orderService.getOrderById(14L)).thenReturn(Optional.of(order));

        mockMvc.perform(get("/api/orders/14"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(14));
    }
}
