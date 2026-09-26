CREATE TABLE ai_settings (
 id varchar(20) PRIMARY KEY CHECK (id = 'platform'),
 enabled boolean NOT NULL DEFAULT true,
 model varchar(120),
 input_rate double precision CHECK (input_rate >= 0 AND input_rate <= 10000),
 cached_input_rate double precision CHECK (cached_input_rate >= 0 AND cached_input_rate <= 10000),
 output_rate double precision CHECK (output_rate >= 0 AND output_rate <= 10000),
 monthly_budget double precision CHECK (monthly_budget >= 0 AND monthly_budget <= 1000000),
 checked_at timestamptz(6), check_status varchar(30), check_fingerprint varchar(64),
 updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE TABLE ai_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 feature varchar(30) NOT NULL CHECK (feature IN ('PRESCRIPTION','MEDICINE_BOX')),
 model varchar(120) NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'STARTED' CHECK (status IN ('STARTED','SUCCEEDED','FAILED')),
 input_tokens integer CHECK (input_tokens >= 0),
 cached_input_tokens integer CHECK (cached_input_tokens >= 0 AND cached_input_tokens <= input_tokens),
 output_tokens integer CHECK (output_tokens >= 0),
 estimated_cost_usd decimal(20,8) CHECK (estimated_cost_usd >= 0),
 duration_ms integer CHECK (duration_ms >= 0), error_code varchar(30),
 created_at timestamptz(6) NOT NULL DEFAULT now(), completed_at timestamptz(6)
);
CREATE INDEX ai_requests_created_at_id_idx ON ai_requests(created_at,id);
CREATE INDEX ai_requests_feature_status_created_at_idx ON ai_requests(feature,status,created_at);
