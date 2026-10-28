-- Explicit refund channel also supports returning goods obtained by exchange.
ALTER TABLE returns ADD COLUMN refund_method ENUM('CASH','TERMINAL','EXCHANGE') NULL;
UPDATE returns r JOIN sales s ON s.id=r.sale_id
SET r.refund_method=IF(r.exchange_id IS NOT NULL,'EXCHANGE',IF(s.payment_method='CASH','CASH','TERMINAL'))
WHERE r.state='POSTED';
