--
-- PostgreSQL database dump
--

\restrict HKYh391sHqObKUcxFgtx7ZI3rCwh1lSs6EEc8OMKW6cjm342w4sXQIahfls10Q0

-- Dumped from database version 16.12 (0113957)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

BEGIN

    NEW.updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;

END;

$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO neondb_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: backlog_history; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.backlog_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_profile_id uuid NOT NULL,
    subject character varying(255) NOT NULL,
    semester character varying(50) NOT NULL,
    cleared boolean DEFAULT false,
    cleared_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.backlog_history OWNER TO neondb_owner;

--
-- Name: box_files; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.box_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pr_id uuid NOT NULL,
    pr_name text NOT NULL,
    department text NOT NULL,
    batch text NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    s3_key text NOT NULL,
    uploaded_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.box_files OWNER TO neondb_owner;

--
-- Name: cgpa_references; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.cgpa_references (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    roll_number character varying(50) NOT NULL,
    cgpa numeric(4,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.cgpa_references OWNER TO neondb_owner;

--
-- Name: company_statistics; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.company_statistics (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    analytics_id uuid NOT NULL,
    company_name character varying(255) NOT NULL,
    students_placed integer DEFAULT 0,
    average_package numeric(10,2) DEFAULT 0,
    highest_package numeric(10,2) DEFAULT 0,
    lowest_package numeric(10,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.company_statistics OWNER TO neondb_owner;

--
-- Name: deleted_users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.deleted_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    original_user_id uuid NOT NULL,
    original_user_data jsonb NOT NULL,
    deleted_by uuid,
    deletion_reason text,
    deleted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_id uuid,
    email text,
    name text,
    role text,
    user_data jsonb
);


ALTER TABLE public.deleted_users OWNER TO neondb_owner;

--
-- Name: deletion_requests; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.deletion_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    job_drive_id uuid,
    job_drive_company_name character varying(255),
    job_drive_role character varying(255),
    job_drive_date date,
    job_drive_created_by uuid,
    requested_by uuid NOT NULL,
    reason text NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    reviewed_by uuid,
    reviewed_at timestamp without time zone,
    review_comments text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT deletion_requests_reason_check CHECK ((length(reason) <= 500)),
    CONSTRAINT deletion_requests_review_comments_check CHECK ((length(review_comments) <= 500)),
    CONSTRAINT deletion_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.deletion_requests OWNER TO neondb_owner;

--
-- Name: department_company_stats; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.department_company_stats (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    department_stat_id uuid NOT NULL,
    company_name character varying(255) NOT NULL,
    students_placed integer DEFAULT 0,
    average_package numeric(10,2) DEFAULT 0,
    packages numeric(10,2)[],
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.department_company_stats OWNER TO neondb_owner;

--
-- Name: department_statistics; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.department_statistics (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    analytics_id uuid NOT NULL,
    department character varying(100) NOT NULL,
    total_students integer DEFAULT 0,
    placed_students integer DEFAULT 0,
    placement_rate numeric(5,2) DEFAULT 0,
    highest_package numeric(10,2) DEFAULT 0,
    lowest_package numeric(10,2) DEFAULT 0,
    total_companies integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.department_statistics OWNER TO neondb_owner;

--
-- Name: file_notification_state; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.file_notification_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_kind character varying(30) NOT NULL,
    entity_key text NOT NULL,
    job_drive_id uuid,
    pr_user_id uuid,
    department text,
    file_type character varying(30) NOT NULL,
    deadline_at timestamp without time zone,
    notification_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    last_notification_sent timestamp without time zone,
    is_submitted boolean DEFAULT false NOT NULL,
    is_deleted_by_po boolean DEFAULT false NOT NULL,
    resubmission_required boolean DEFAULT false NOT NULL,
    po_deadline_notified boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.file_notification_state OWNER TO neondb_owner;

--
-- Name: job_applications; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.job_applications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    job_drive_id uuid NOT NULL,
    student_id uuid NOT NULL,
    applied_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(50) DEFAULT 'applied'::character varying,
    CONSTRAINT job_applications_status_check CHECK (((status)::text = ANY ((ARRAY['applied'::character varying, 'shortlisted'::character varying, 'rejected'::character varying, 'selected'::character varying])::text[])))
);


ALTER TABLE public.job_applications OWNER TO neondb_owner;

--
-- Name: TABLE job_applications; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.job_applications IS 'Student applications to job drives';


--
-- Name: job_drive_applications; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.job_drive_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_drive_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status character varying(50) DEFAULT 'applied'::character varying,
    applied_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    notes text
);


ALTER TABLE public.job_drive_applications OWNER TO neondb_owner;

--
-- Name: job_drive_files; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.job_drive_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_drive_id text NOT NULL,
    uploader_id uuid NOT NULL,
    file_type character varying(50) NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.job_drive_files OWNER TO neondb_owner;

--
-- Name: job_drive_rounds; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.job_drive_rounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_drive_id uuid NOT NULL,
    round_number integer NOT NULL,
    round_name character varying(255),
    round_type character varying(100),
    date date,
    "time" character varying(10),
    venue character varying(255),
    description text,
    selected_students uuid[],
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.job_drive_rounds OWNER TO neondb_owner;

--
-- Name: job_drives; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.job_drives (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_name character varying(255) NOT NULL,
    company_website character varying(500),
    company_description text,
    recruiter_name character varying(255),
    recruiter_email character varying(255),
    recruiter_phone character varying(20),
    drive_mode character varying(50) DEFAULT 'on-campus'::character varying,
    locations text[],
    location character varying(255),
    role character varying(255) NOT NULL,
    job_type character varying(50) DEFAULT 'full-time'::character varying,
    description text NOT NULL,
    requirements text,
    skills text[],
    ctc numeric(10,2),
    ctc_base_salary numeric(10,2) DEFAULT 0,
    ctc_variable_pay numeric(10,2) DEFAULT 0,
    ctc_joining_bonus numeric(10,2) DEFAULT 0,
    ctc_other_benefits text,
    bond text,
    bond_amount numeric(10,2) DEFAULT 0,
    bond_duration character varying(100),
    eligibility_min_cgpa numeric(4,2) DEFAULT 0,
    eligibility_max_backlogs integer DEFAULT 0,
    eligibility_allowed_departments text[],
    eligibility_allowed_batches text[],
    spoc_dept character varying(100),
    is_dream_job boolean DEFAULT false,
    unplaced_only boolean DEFAULT false,
    drive_date date NOT NULL,
    drive_time time without time zone,
    deadline date,
    application_deadline_time time without time zone,
    venue character varying(500),
    rounds text[],
    test_details text,
    interview_process text,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT job_drives_drive_mode_check CHECK (((drive_mode)::text = ANY ((ARRAY['on-campus'::character varying, 'remote'::character varying, 'pooled-campus'::character varying])::text[])))
);


ALTER TABLE public.job_drives OWNER TO neondb_owner;

--
-- Name: TABLE job_drives; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.job_drives IS 'Job placement drives and opportunities posted by companies';


--
-- Name: neon_mirror; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.neon_mirror (
    id bigint NOT NULL,
    model_name text NOT NULL,
    doc_id text NOT NULL,
    operation text NOT NULL,
    document jsonb,
    query jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.neon_mirror OWNER TO neondb_owner;

--
-- Name: neon_mirror_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.neon_mirror_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.neon_mirror_id_seq OWNER TO neondb_owner;

--
-- Name: neon_mirror_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.neon_mirror_id_seq OWNED BY public.neon_mirror.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    user_role character varying(50) NOT NULL,
    department character varying(50),
    type character varying(50) NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO neondb_owner;

--
-- Name: placed_students; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.placed_students (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    job_drive_id uuid NOT NULL,
    company_name character varying(255) NOT NULL,
    student_name character varying(255) NOT NULL,
    roll_number character varying(50) NOT NULL,
    department character varying(100),
    email character varying(255),
    mobile_number character varying(15),
    cgpa numeric(4,2),
    added_by uuid,
    added_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.placed_students OWNER TO neondb_owner;

--
-- Name: TABLE placed_students; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.placed_students IS 'Records of students successfully placed in companies';


--
-- Name: placement_analytics; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.placement_analytics (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    batch character varying(50) NOT NULL,
    uploaded_by uuid NOT NULL,
    total_students integer DEFAULT 0,
    placed_students integer DEFAULT 0,
    placement_rate numeric(5,2) DEFAULT 0,
    average_package numeric(10,2) DEFAULT 0,
    highest_package numeric(10,2) DEFAULT 0,
    lowest_package numeric(10,2) DEFAULT 0,
    total_companies integer DEFAULT 0,
    file_name character varying(500),
    file_path character varying(500),
    uploaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.placement_analytics OWNER TO neondb_owner;

--
-- Name: TABLE placement_analytics; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.placement_analytics IS 'Batch-wise placement statistics and analytics';


--
-- Name: placement_analytics_data; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.placement_analytics_data (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    analytics_id uuid NOT NULL,
    student_name character varying(255),
    department character varying(100),
    company character varying(255),
    package numeric(10,2),
    status character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.placement_analytics_data OWNER TO neondb_owner;

--
-- Name: placement_consents; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.placement_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    has_agreed boolean DEFAULT false NOT NULL,
    agreed_at timestamp without time zone,
    signature text,
    ip_address text,
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.placement_consents OWNER TO neondb_owner;

--
-- Name: placement_templates; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.placement_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type character varying(50) NOT NULL,
    file_name character varying(255) NOT NULL,
    file_url text NOT NULL,
    uploaded_by uuid,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.placement_templates OWNER TO neondb_owner;

--
-- Name: pr_allowlist; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.pr_allowlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    department character varying(255),
    notes text,
    status character varying(50) DEFAULT 'pending'::character varying,
    requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    approved_at timestamp without time zone,
    approved_by uuid,
    rejected_at timestamp without time zone,
    rejected_by uuid,
    rejection_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.pr_allowlist OWNER TO neondb_owner;

--
-- Name: pr_allowlists; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.pr_allowlists (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    department character varying(100),
    notes text,
    status character varying(50) DEFAULT 'pending'::character varying,
    approved_by uuid,
    approved_date timestamp without time zone,
    rejection_reason text,
    is_first_po boolean DEFAULT false,
    requires_existing_po_approval boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pr_allowlists_role_check CHECK (((role)::text = ANY ((ARRAY['placement_representative'::character varying, 'placement_officer'::character varying])::text[]))),
    CONSTRAINT pr_allowlists_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.pr_allowlists OWNER TO neondb_owner;

--
-- Name: resources; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.resources (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title character varying(500) NOT NULL,
    type character varying(50) NOT NULL,
    department character varying(50) DEFAULT 'ALL'::character varying,
    url_or_path character varying(1000) NOT NULL,
    meta jsonb,
    description text,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT resources_department_check CHECK (((department)::text = ANY ((ARRAY['CSE'::character varying, 'IT'::character varying, 'ECE'::character varying, 'MECH'::character varying, 'PROD'::character varying, 'IBT'::character varying, 'EEE'::character varying, 'CIVIL'::character varying, 'EIE'::character varying, 'ALL'::character varying])::text[]))),
    CONSTRAINT resources_type_check CHECK (((type)::text = ANY ((ARRAY['pdf'::character varying, 'link'::character varying, 'video'::character varying, 'sample_test'::character varying])::text[])))
);


ALTER TABLE public.resources OWNER TO neondb_owner;

--
-- Name: selection_round_students; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.selection_round_students (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    selection_round_id uuid NOT NULL,
    student_id uuid NOT NULL,
    selected_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.selection_round_students OWNER TO neondb_owner;

--
-- Name: selection_rounds; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.selection_rounds (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    job_drive_id uuid NOT NULL,
    round_name character varying(255),
    round_details text,
    round_date date,
    round_time time without time zone,
    status character varying(50) DEFAULT 'pending'::character varying,
    round_order integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT selection_rounds_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in-progress'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.selection_rounds OWNER TO neondb_owner;

--
-- Name: settings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.settings (
    setting_name text NOT NULL,
    value text NOT NULL
);


ALTER TABLE public.settings OWNER TO neondb_owner;

--
-- Name: test_assignments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.test_assignments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    test_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(50) NOT NULL,
    enabled boolean DEFAULT false,
    status character varying(50) DEFAULT 'new'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT test_assignments_role_check CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'placement_representative'::character varying])::text[]))),
    CONSTRAINT test_assignments_status_check CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'in_progress'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.test_assignments OWNER TO neondb_owner;

--
-- Name: TABLE test_assignments; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.test_assignments IS 'Assignment of tests to specific users';


--
-- Name: test_submission_answers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.test_submission_answers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    submission_id uuid NOT NULL,
    question text,
    is_correct boolean,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.test_submission_answers OWNER TO neondb_owner;

--
-- Name: test_submissions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.test_submissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    test_id uuid NOT NULL,
    user_id uuid NOT NULL,
    quiz_session_id character varying(255),
    score numeric(10,2) NOT NULL,
    total numeric(10,2) NOT NULL,
    correct_count integer,
    submitted_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.test_submissions OWNER TO neondb_owner;

--
-- Name: TABLE test_submissions; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.test_submissions IS 'Test results and submissions by users';


--
-- Name: tests; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.tests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    department character varying(50) NOT NULL,
    duration_mins integer NOT NULL,
    status character varying(50) DEFAULT 'draft'::character varying,
    start_at timestamp without time zone,
    end_at timestamp without time zone,
    quiz_backend_id character varying(255),
    total_questions integer,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    spreadsheet_id text,
    CONSTRAINT tests_department_check CHECK (((department)::text = ANY ((ARRAY['CSE'::character varying, 'IT'::character varying, 'ECE'::character varying, 'MECH'::character varying, 'PROD'::character varying, 'IBT'::character varying, 'EEE'::character varying, 'CIVIL'::character varying, 'EIE'::character varying, 'ALL'::character varying])::text[]))),
    CONSTRAINT tests_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'closed'::character varying])::text[])))
);


ALTER TABLE public.tests OWNER TO neondb_owner;

--
-- Name: TABLE tests; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.tests IS 'Placement preparation tests created by placement representatives';


--
-- Name: user_marksheets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_marksheets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_profile_id uuid NOT NULL,
    file_path character varying(500) NOT NULL,
    uploaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_marksheets OWNER TO neondb_owner;

--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    profile_name character varying(255),
    roll_number character varying(50),
    register_no character varying(50),
    gender character varying(20),
    date_of_birth date,
    personal_email character varying(255),
    college_email character varying(255),
    tenth_percentage numeric(5,2),
    twelfth_percentage numeric(5,2),
    diploma_percentage numeric(5,2),
    degree character varying(50),
    department character varying(100),
    graduation_year integer,
    cgpa numeric(4,2),
    address text,
    phone_number character varying(15),
    linkedin_url character varying(500),
    github_url character varying(500),
    photo character varying(500),
    college_id_card character varying(500),
    resume character varying(500),
    current_backlogs integer DEFAULT 0,
    about_me text,
    skills text[],
    is_profile_complete boolean DEFAULT false,
    profile_completion_percentage integer DEFAULT 0,
    is_placed boolean DEFAULT false,
    placement_status character varying(50) DEFAULT 'unplaced'::character varying,
    offer_company character varying(255),
    offer_ctc numeric(10,2),
    offer_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    profile_data jsonb DEFAULT '{}'::jsonb,
    marksheets text[],
    batch character varying(50),
    history_of_backlogs jsonb,
    resume_drive_link text,
    pan_card_drive_link text,
    aadhar_card_drive_link text,
    CONSTRAINT user_profiles_about_me_check CHECK (((length(about_me) >= 50) AND (length(about_me) <= 500))),
    CONSTRAINT user_profiles_cgpa_check CHECK (((cgpa >= (0)::numeric) AND (cgpa <= (10)::numeric))),
    CONSTRAINT user_profiles_degree_check CHECK (((degree)::text = ANY ((ARRAY['B.E'::character varying, 'B.TECH'::character varying])::text[]))),
    CONSTRAINT user_profiles_diploma_percentage_check CHECK (((diploma_percentage >= (0)::numeric) AND (diploma_percentage <= (100)::numeric))),
    CONSTRAINT user_profiles_gender_check CHECK (((gender)::text = ANY ((ARRAY['Male'::character varying, 'Female'::character varying, 'Other'::character varying])::text[]))),
    CONSTRAINT user_profiles_phone_number_check CHECK (((phone_number)::text ~ '^\d{10}$'::text)),
    CONSTRAINT user_profiles_placement_status_check CHECK (((placement_status)::text = ANY ((ARRAY['unplaced'::character varying, 'shortlisted'::character varying, 'placed'::character varying])::text[]))),
    CONSTRAINT user_profiles_tenth_percentage_check CHECK (((tenth_percentage >= (0)::numeric) AND (tenth_percentage <= (100)::numeric))),
    CONSTRAINT user_profiles_twelfth_percentage_check CHECK (((twelfth_percentage >= (0)::numeric) AND (twelfth_percentage <= (100)::numeric)))
);


ALTER TABLE public.user_profiles OWNER TO neondb_owner;

--
-- Name: TABLE user_profiles; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.user_profiles IS 'Extended profile information for students and placement representatives';


--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    is_verified boolean DEFAULT false,
    verification_token character varying(255),
    verification_token_expires timestamp without time zone,
    reset_password_token character varying(255),
    reset_password_expires timestamp without time zone,
    consent_has_agreed boolean DEFAULT false,
    consent_agreed_at timestamp without time zone,
    consent_signature text,
    consent_pdf_path character varying(500),
    consent_ip_address character varying(45),
    consent_user_agent text,
    otp_is_verified boolean DEFAULT false,
    otp_code character varying(10),
    otp_expires timestamp without time zone,
    otp_verified boolean DEFAULT false,
    otp_verified_at timestamp without time zone,
    otp_attempts integer DEFAULT 0,
    otp_last_sent timestamp without time zone,
    otp_resend_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT email_format CHECK (((email)::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'placement_officer'::character varying, 'placement_representative'::character varying, 'admin'::character varying, 'po'::character varying, 'pr'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.users IS 'Stores all user accounts including students, placement officers, and representatives';


--
-- Name: v_active_job_drives; Type: VIEW; Schema: public; Owner: neondb_owner
--

CREATE VIEW public.v_active_job_drives AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(255) AS company_name,
    NULL::character varying(500) AS company_website,
    NULL::text AS company_description,
    NULL::character varying(255) AS recruiter_name,
    NULL::character varying(255) AS recruiter_email,
    NULL::character varying(20) AS recruiter_phone,
    NULL::character varying(50) AS drive_mode,
    NULL::text[] AS locations,
    NULL::character varying(255) AS location,
    NULL::character varying(255) AS role,
    NULL::character varying(50) AS job_type,
    NULL::text AS description,
    NULL::text AS requirements,
    NULL::text[] AS skills,
    NULL::numeric(10,2) AS ctc,
    NULL::numeric(10,2) AS ctc_base_salary,
    NULL::numeric(10,2) AS ctc_variable_pay,
    NULL::numeric(10,2) AS ctc_joining_bonus,
    NULL::text AS ctc_other_benefits,
    NULL::text AS bond,
    NULL::numeric(10,2) AS bond_amount,
    NULL::character varying(100) AS bond_duration,
    NULL::numeric(4,2) AS eligibility_min_cgpa,
    NULL::integer AS eligibility_max_backlogs,
    NULL::text[] AS eligibility_allowed_departments,
    NULL::text[] AS eligibility_allowed_batches,
    NULL::character varying(100) AS spoc_dept,
    NULL::boolean AS is_dream_job,
    NULL::boolean AS unplaced_only,
    NULL::date AS drive_date,
    NULL::time without time zone AS drive_time,
    NULL::date AS deadline,
    NULL::time without time zone AS application_deadline_time,
    NULL::character varying(500) AS venue,
    NULL::text[] AS rounds,
    NULL::text AS test_details,
    NULL::text AS interview_process,
    NULL::boolean AS is_active,
    NULL::uuid AS created_by,
    NULL::timestamp without time zone AS created_at,
    NULL::timestamp without time zone AS updated_at,
    NULL::bigint AS application_count,
    NULL::bigint AS placed_count;


ALTER VIEW public.v_active_job_drives OWNER TO neondb_owner;

--
-- Name: v_student_placement_summary; Type: VIEW; Schema: public; Owner: neondb_owner
--

CREATE VIEW public.v_student_placement_summary AS
 SELECT u.id AS user_id,
    u.name,
    u.email,
    up.roll_number,
    up.department,
    up.cgpa,
    up.placement_status,
    count(DISTINCT ja.id) AS applications_count,
    ps.company_name AS placed_company,
    ps.added_at AS placement_date
   FROM (((public.users u
     JOIN public.user_profiles up ON ((u.id = up.user_id)))
     LEFT JOIN public.job_applications ja ON ((u.id = ja.student_id)))
     LEFT JOIN public.placed_students ps ON (((up.roll_number)::text = (ps.roll_number)::text)))
  WHERE ((u.role)::text = 'student'::text)
  GROUP BY u.id, u.name, u.email, up.roll_number, up.department, up.cgpa, up.placement_status, ps.company_name, ps.added_at;


ALTER VIEW public.v_student_placement_summary OWNER TO neondb_owner;

--
-- Name: verification_status; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.verification_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    otp_verified boolean DEFAULT false NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    otp_code text,
    otp_expires timestamp without time zone,
    otp_attempts integer DEFAULT 0 NOT NULL,
    otp_resend_count integer DEFAULT 0 NOT NULL,
    last_otp_sent timestamp without time zone,
    verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.verification_status OWNER TO neondb_owner;

--
-- Name: v_users_complete; Type: VIEW; Schema: public; Owner: neondb_owner
--

CREATE VIEW public.v_users_complete AS
 SELECT u.id,
    u.name,
    u.email,
    u.password,
    u.role,
    u.is_verified,
    u.verification_token,
    u.verification_token_expires,
    u.created_at,
    u.updated_at,
    up.profile_name,
    up.roll_number,
    up.department,
    up.cgpa,
    up.graduation_year,
    up.is_profile_complete,
    up.profile_completion_percentage,
    up.is_placed,
    up.placement_status,
    up.phone_number,
    up.linkedin_url,
    pc.has_agreed AS consent_has_agreed,
    pc.agreed_at AS consent_agreed_at,
    pc.signature AS consent_signature,
    vs.otp_verified,
    vs.is_verified AS otp_is_verified,
    vs.otp_code,
    vs.otp_expires,
    vs.otp_attempts,
    vs.otp_resend_count,
    vs.last_otp_sent,
    vs.verified_at
   FROM (((public.users u
     LEFT JOIN public.user_profiles up ON ((u.id = up.user_id)))
     LEFT JOIN public.placement_consents pc ON ((u.id = pc.user_id)))
     LEFT JOIN public.verification_status vs ON ((u.id = vs.user_id)));


ALTER VIEW public.v_users_complete OWNER TO neondb_owner;

--
-- Name: neon_mirror id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.neon_mirror ALTER COLUMN id SET DEFAULT nextval('public.neon_mirror_id_seq'::regclass);


--
-- Name: backlog_history backlog_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.backlog_history
    ADD CONSTRAINT backlog_history_pkey PRIMARY KEY (id);


--
-- Name: box_files box_files_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.box_files
    ADD CONSTRAINT box_files_pkey PRIMARY KEY (id);


--
-- Name: cgpa_references cgpa_references_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cgpa_references
    ADD CONSTRAINT cgpa_references_pkey PRIMARY KEY (id);


--
-- Name: cgpa_references cgpa_references_roll_number_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cgpa_references
    ADD CONSTRAINT cgpa_references_roll_number_key UNIQUE (roll_number);


--
-- Name: company_statistics company_statistics_analytics_id_company_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.company_statistics
    ADD CONSTRAINT company_statistics_analytics_id_company_name_key UNIQUE (analytics_id, company_name);


--
-- Name: company_statistics company_statistics_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.company_statistics
    ADD CONSTRAINT company_statistics_pkey PRIMARY KEY (id);


--
-- Name: deleted_users deleted_users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.deleted_users
    ADD CONSTRAINT deleted_users_pkey PRIMARY KEY (id);


--
-- Name: deletion_requests deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.deletion_requests
    ADD CONSTRAINT deletion_requests_pkey PRIMARY KEY (id);


--
-- Name: department_company_stats department_company_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.department_company_stats
    ADD CONSTRAINT department_company_stats_pkey PRIMARY KEY (id);


--
-- Name: department_statistics department_statistics_analytics_id_department_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.department_statistics
    ADD CONSTRAINT department_statistics_analytics_id_department_key UNIQUE (analytics_id, department);


--
-- Name: department_statistics department_statistics_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.department_statistics
    ADD CONSTRAINT department_statistics_pkey PRIMARY KEY (id);


--
-- Name: file_notification_state file_notification_state_entity_key_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_notification_state
    ADD CONSTRAINT file_notification_state_entity_key_key UNIQUE (entity_key);


--
-- Name: file_notification_state file_notification_state_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_notification_state
    ADD CONSTRAINT file_notification_state_pkey PRIMARY KEY (id);


--
-- Name: job_applications job_applications_job_drive_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_applications
    ADD CONSTRAINT job_applications_job_drive_id_student_id_key UNIQUE (job_drive_id, student_id);


--
-- Name: job_applications job_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_applications
    ADD CONSTRAINT job_applications_pkey PRIMARY KEY (id);


--
-- Name: job_drive_applications job_drive_applications_job_drive_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_drive_applications
    ADD CONSTRAINT job_drive_applications_job_drive_id_student_id_key UNIQUE (job_drive_id, student_id);


--
-- Name: job_drive_applications job_drive_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_drive_applications
    ADD CONSTRAINT job_drive_applications_pkey PRIMARY KEY (id);


--
-- Name: job_drive_files job_drive_files_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_drive_files
    ADD CONSTRAINT job_drive_files_pkey PRIMARY KEY (id);


--
-- Name: job_drive_rounds job_drive_rounds_job_drive_id_round_number_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_drive_rounds
    ADD CONSTRAINT job_drive_rounds_job_drive_id_round_number_key UNIQUE (job_drive_id, round_number);


--
-- Name: job_drive_rounds job_drive_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_drive_rounds
    ADD CONSTRAINT job_drive_rounds_pkey PRIMARY KEY (id);


--
-- Name: job_drives job_drives_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_drives
    ADD CONSTRAINT job_drives_pkey PRIMARY KEY (id);


--
-- Name: neon_mirror neon_mirror_model_name_doc_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.neon_mirror
    ADD CONSTRAINT neon_mirror_model_name_doc_id_key UNIQUE (model_name, doc_id);


--
-- Name: neon_mirror neon_mirror_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.neon_mirror
    ADD CONSTRAINT neon_mirror_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: placed_students placed_students_job_drive_id_roll_number_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placed_students
    ADD CONSTRAINT placed_students_job_drive_id_roll_number_key UNIQUE (job_drive_id, roll_number);


--
-- Name: placed_students placed_students_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placed_students
    ADD CONSTRAINT placed_students_pkey PRIMARY KEY (id);


--
-- Name: placement_analytics placement_analytics_batch_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placement_analytics
    ADD CONSTRAINT placement_analytics_batch_key UNIQUE (batch);


--
-- Name: placement_analytics_data placement_analytics_data_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placement_analytics_data
    ADD CONSTRAINT placement_analytics_data_pkey PRIMARY KEY (id);


--
-- Name: placement_analytics placement_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placement_analytics
    ADD CONSTRAINT placement_analytics_pkey PRIMARY KEY (id);


--
-- Name: placement_consents placement_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placement_consents
    ADD CONSTRAINT placement_consents_pkey PRIMARY KEY (id);


--
-- Name: placement_consents placement_consents_user_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placement_consents
    ADD CONSTRAINT placement_consents_user_id_key UNIQUE (user_id);


--
-- Name: placement_templates placement_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placement_templates
    ADD CONSTRAINT placement_templates_pkey PRIMARY KEY (id);


--
-- Name: pr_allowlist pr_allowlist_email_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pr_allowlist
    ADD CONSTRAINT pr_allowlist_email_key UNIQUE (email);


--
-- Name: pr_allowlist pr_allowlist_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pr_allowlist
    ADD CONSTRAINT pr_allowlist_pkey PRIMARY KEY (id);


--
-- Name: pr_allowlists pr_allowlists_email_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pr_allowlists
    ADD CONSTRAINT pr_allowlists_email_key UNIQUE (email);


--
-- Name: pr_allowlists pr_allowlists_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pr_allowlists
    ADD CONSTRAINT pr_allowlists_pkey PRIMARY KEY (id);


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);


--
-- Name: selection_round_students selection_round_students_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.selection_round_students
    ADD CONSTRAINT selection_round_students_pkey PRIMARY KEY (id);


--
-- Name: selection_round_students selection_round_students_selection_round_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.selection_round_students
    ADD CONSTRAINT selection_round_students_selection_round_id_student_id_key UNIQUE (selection_round_id, student_id);


--
-- Name: selection_rounds selection_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.selection_rounds
    ADD CONSTRAINT selection_rounds_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (setting_name);


--
-- Name: test_assignments test_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.test_assignments
    ADD CONSTRAINT test_assignments_pkey PRIMARY KEY (id);


--
-- Name: test_assignments test_assignments_test_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.test_assignments
    ADD CONSTRAINT test_assignments_test_id_user_id_key UNIQUE (test_id, user_id);


--
-- Name: test_submission_answers test_submission_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.test_submission_answers
    ADD CONSTRAINT test_submission_answers_pkey PRIMARY KEY (id);


--
-- Name: test_submissions test_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.test_submissions
    ADD CONSTRAINT test_submissions_pkey PRIMARY KEY (id);


--
-- Name: test_submissions test_submissions_test_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.test_submissions
    ADD CONSTRAINT test_submissions_test_id_user_id_key UNIQUE (test_id, user_id);


--
-- Name: tests tests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_pkey PRIMARY KEY (id);


--
-- Name: user_marksheets user_marksheets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_marksheets
    ADD CONSTRAINT user_marksheets_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_roll_number_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_roll_number_key UNIQUE (roll_number);


--
-- Name: user_profiles user_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verification_status verification_status_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.verification_status
    ADD CONSTRAINT verification_status_pkey PRIMARY KEY (id);


--
-- Name: verification_status verification_status_user_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.verification_status
    ADD CONSTRAINT verification_status_user_id_key UNIQUE (user_id);


--
-- Name: idx_backlog_history_profile_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_backlog_history_profile_id ON public.backlog_history USING btree (user_profile_id);


--
-- Name: idx_cgpa_references_roll_number; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cgpa_references_roll_number ON public.cgpa_references USING btree (roll_number);


--
-- Name: idx_company_statistics_analytics_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_company_statistics_analytics_id ON public.company_statistics USING btree (analytics_id);


--
-- Name: idx_deleted_users_deleted_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_deleted_users_deleted_at ON public.deleted_users USING btree (deleted_at);


--
-- Name: idx_deleted_users_original_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_deleted_users_original_user_id ON public.deleted_users USING btree (original_user_id);


--
-- Name: idx_deletion_requests_job_drive_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_deletion_requests_job_drive_id ON public.deletion_requests USING btree (job_drive_id);


--
-- Name: idx_deletion_requests_requested_by; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_deletion_requests_requested_by ON public.deletion_requests USING btree (requested_by);


--
-- Name: idx_deletion_requests_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_deletion_requests_status ON public.deletion_requests USING btree (status);


--
-- Name: idx_deletion_requests_status_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_deletion_requests_status_created ON public.deletion_requests USING btree (status, created_at DESC);


--
-- Name: idx_department_statistics_analytics_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_department_statistics_analytics_id ON public.department_statistics USING btree (analytics_id);


--
-- Name: idx_dept_company_stats_dept_stat_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dept_company_stats_dept_stat_id ON public.department_company_stats USING btree (department_stat_id);


--
-- Name: idx_file_notify_drive_department; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_notify_drive_department ON public.file_notification_state USING btree (job_drive_id, department, file_type);


--
-- Name: idx_file_notify_entity_kind_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_notify_entity_kind_status ON public.file_notification_state USING btree (entity_kind, file_type, notification_status);


--
-- Name: idx_job_applications_job_drive_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_applications_job_drive_id ON public.job_applications USING btree (job_drive_id);


--
-- Name: idx_job_applications_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_applications_status ON public.job_applications USING btree (status);


--
-- Name: idx_job_applications_student_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_applications_student_id ON public.job_applications USING btree (student_id);


--
-- Name: idx_job_drive_applications_drive; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_drive_applications_drive ON public.job_drive_applications USING btree (job_drive_id);


--
-- Name: idx_job_drive_applications_student; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_drive_applications_student ON public.job_drive_applications USING btree (student_id);


--
-- Name: idx_job_drive_rounds_drive; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_drive_rounds_drive ON public.job_drive_rounds USING btree (job_drive_id);


--
-- Name: idx_job_drives_company_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_drives_company_name ON public.job_drives USING btree (company_name);


--
-- Name: idx_job_drives_created_by; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_drives_created_by ON public.job_drives USING btree (created_by);


--
-- Name: idx_job_drives_drive_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_drives_drive_date ON public.job_drives USING btree (drive_date);


--
-- Name: idx_job_drives_is_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_drives_is_active ON public.job_drives USING btree (is_active);


--
-- Name: idx_job_drives_spoc_dept; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_drives_spoc_dept ON public.job_drives USING btree (spoc_dept);


--
-- Name: idx_neon_mirror_model; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_neon_mirror_model ON public.neon_mirror USING btree (model_name);


--
-- Name: idx_neon_mirror_updated_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_neon_mirror_updated_at ON public.neon_mirror USING btree (updated_at DESC);


--
-- Name: idx_notifications_department_type_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_department_type_created ON public.notifications USING btree (department, type, created_at DESC);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_placed_students_company_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_placed_students_company_name ON public.placed_students USING btree (company_name);


--
-- Name: idx_placed_students_job_drive_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_placed_students_job_drive_id ON public.placed_students USING btree (job_drive_id);


--
-- Name: idx_placed_students_roll_number; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_placed_students_roll_number ON public.placed_students USING btree (roll_number);


--
-- Name: idx_placement_analytics_batch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_placement_analytics_batch ON public.placement_analytics USING btree (batch);


--
-- Name: idx_placement_analytics_data_analytics_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_placement_analytics_data_analytics_id ON public.placement_analytics_data USING btree (analytics_id);


--
-- Name: idx_placement_consents_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_placement_consents_user_id ON public.placement_consents USING btree (user_id);


--
-- Name: idx_pr_allowlist_email; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pr_allowlist_email ON public.pr_allowlist USING btree (email);


--
-- Name: idx_pr_allowlist_role; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pr_allowlist_role ON public.pr_allowlist USING btree (role);


--
-- Name: idx_pr_allowlist_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pr_allowlist_status ON public.pr_allowlist USING btree (status);


--
-- Name: idx_pr_allowlists_email; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pr_allowlists_email ON public.pr_allowlists USING btree (email);


--
-- Name: idx_pr_allowlists_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pr_allowlists_status ON public.pr_allowlists USING btree (status);


--
-- Name: idx_resources_created_by; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_resources_created_by ON public.resources USING btree (created_by);


--
-- Name: idx_resources_department; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_resources_department ON public.resources USING btree (department);


--
-- Name: idx_resources_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_resources_type ON public.resources USING btree (type);


--
-- Name: idx_selection_round_students_round_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_selection_round_students_round_id ON public.selection_round_students USING btree (selection_round_id);


--
-- Name: idx_selection_round_students_student_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_selection_round_students_student_id ON public.selection_round_students USING btree (student_id);


--
-- Name: idx_selection_rounds_job_drive_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_selection_rounds_job_drive_id ON public.selection_rounds USING btree (job_drive_id);


--
-- Name: idx_test_assignments_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_test_assignments_status ON public.test_assignments USING btree (status);


--
-- Name: idx_test_assignments_test_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_test_assignments_test_id ON public.test_assignments USING btree (test_id);


--
-- Name: idx_test_assignments_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_test_assignments_user_id ON public.test_assignments USING btree (user_id);


--
-- Name: idx_test_submission_answers_submission_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_test_submission_answers_submission_id ON public.test_submission_answers USING btree (submission_id);


--
-- Name: idx_test_submissions_test_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_test_submissions_test_id ON public.test_submissions USING btree (test_id);


--
-- Name: idx_test_submissions_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_test_submissions_user_id ON public.test_submissions USING btree (user_id);


--
-- Name: idx_tests_created_by; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tests_created_by ON public.tests USING btree (created_by);


--
-- Name: idx_tests_department; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tests_department ON public.tests USING btree (department);


--
-- Name: idx_tests_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tests_status ON public.tests USING btree (status);


--
-- Name: idx_user_marksheets_profile_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_marksheets_profile_id ON public.user_marksheets USING btree (user_profile_id);


--
-- Name: idx_user_profiles_department; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_profiles_department ON public.user_profiles USING btree (department);


--
-- Name: idx_user_profiles_placement_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_profiles_placement_status ON public.user_profiles USING btree (placement_status);


--
-- Name: idx_user_profiles_roll_number; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_profiles_roll_number ON public.user_profiles USING btree (roll_number);


--
-- Name: idx_user_profiles_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_profiles_user_id ON public.user_profiles USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_verification_token; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_users_verification_token ON public.users USING btree (verification_token);


--
-- Name: idx_verification_status_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_verification_status_user_id ON public.verification_status USING btree (user_id);


--
-- Name: v_active_job_drives _RETURN; Type: RULE; Schema: public; Owner: neondb_owner
--

CREATE OR REPLACE VIEW public.v_active_job_drives AS
 SELECT jd.id,
    jd.company_name,
    jd.company_website,
    jd.company_description,
    jd.recruiter_name,
    jd.recruiter_email,
    jd.recruiter_phone,
    jd.drive_mode,
    jd.locations,
    jd.location,
    jd.role,
    jd.job_type,
    jd.description,
    jd.requirements,
    jd.skills,
    jd.ctc,
    jd.ctc_base_salary,
    jd.ctc_variable_pay,
    jd.ctc_joining_bonus,
    jd.ctc_other_benefits,
    jd.bond,
    jd.bond_amount,
    jd.bond_duration,
    jd.eligibility_min_cgpa,
    jd.eligibility_max_backlogs,
    jd.eligibility_allowed_departments,
    jd.eligibility_allowed_batches,
    jd.spoc_dept,
    jd.is_dream_job,
    jd.unplaced_only,
    jd.drive_date,
    jd.drive_time,
    jd.deadline,
    jd.application_deadline_time,
    jd.venue,
    jd.rounds,
    jd.test_details,
    jd.interview_process,
    jd.is_active,
    jd.created_by,
    jd.created_at,
    jd.updated_at,
    count(DISTINCT ja.id) AS application_count,
    count(DISTINCT ps.id) AS placed_count
   FROM ((public.job_drives jd
     LEFT JOIN public.job_applications ja ON ((jd.id = ja.job_drive_id)))
     LEFT JOIN public.placed_students ps ON ((jd.id = ps.job_drive_id)))
  WHERE (jd.is_active = true)
  GROUP BY jd.id;


--
-- Name: cgpa_references update_cgpa_references_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_cgpa_references_updated_at BEFORE UPDATE ON public.cgpa_references FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: deletion_requests update_deletion_requests_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_deletion_requests_updated_at BEFORE UPDATE ON public.deletion_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: job_drives update_job_drives_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_job_drives_updated_at BEFORE UPDATE ON public.job_drives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: placed_students update_placed_students_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_placed_students_updated_at BEFORE UPDATE ON public.placed_students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: placement_analytics update_placement_analytics_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_placement_analytics_updated_at BEFORE UPDATE ON public.placement_analytics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pr_allowlists update_pr_allowlists_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_pr_allowlists_updated_at BEFORE UPDATE ON public.pr_allowlists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: resources update_resources_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: test_assignments update_test_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_test_assignments_updated_at BEFORE UPDATE ON public.test_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: test_submissions update_test_submissions_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_test_submissions_updated_at BEFORE UPDATE ON public.test_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tests update_tests_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_tests_updated_at BEFORE UPDATE ON public.tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_profiles update_user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: backlog_history backlog_history_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.backlog_history
    ADD CONSTRAINT backlog_history_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
-- Name: company_statistics company_statistics_analytics_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.company_statistics
    ADD CONSTRAINT company_statistics_analytics_id_fkey FOREIGN KEY (analytics_id) REFERENCES public.placement_analytics(id) ON DELETE CASCADE;


--
-- Name: deleted_users deleted_users_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.deleted_users
    ADD CONSTRAINT deleted_users_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: deletion_requests deletion_requests_job_drive_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.deletion_requests
    ADD CONSTRAINT deletion_requests_job_drive_created_by_fkey FOREIGN KEY (job_drive_created_by) REFERENCES public.users(id);


--
-- Name: deletion_requests deletion_requests_job_drive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.deletion_requests
    ADD CONSTRAINT deletion_requests_job_drive_id_fkey FOREIGN KEY (job_drive_id) REFERENCES public.job_drives(id) ON DELETE SET NULL;


--
-- Name: deletion_requests deletion_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.deletion_requests
    ADD CONSTRAINT deletion_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: deletion_requests deletion_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.deletion_requests
    ADD CONSTRAINT deletion_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: department_company_stats department_company_stats_department_stat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.department_company_stats
    ADD CONSTRAINT department_company_stats_department_stat_id_fkey FOREIGN KEY (department_stat_id) REFERENCES public.department_statistics(id) ON DELETE CASCADE;


--
-- Name: department_statistics department_statistics_analytics_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.department_statistics
    ADD CONSTRAINT department_statistics_analytics_id_fkey FOREIGN KEY (analytics_id) REFERENCES public.placement_analytics(id) ON DELETE CASCADE;


--
-- Name: job_applications job_applications_job_drive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_applications
    ADD CONSTRAINT job_applications_job_drive_id_fkey FOREIGN KEY (job_drive_id) REFERENCES public.job_drives(id) ON DELETE CASCADE;


--
-- Name: job_applications job_applications_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_applications
    ADD CONSTRAINT job_applications_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: job_drive_applications job_drive_applications_job_drive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_drive_applications
    ADD CONSTRAINT job_drive_applications_job_drive_id_fkey FOREIGN KEY (job_drive_id) REFERENCES public.job_drives(id) ON DELETE CASCADE;


--
-- Name: job_drive_applications job_drive_applications_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_drive_applications
    ADD CONSTRAINT job_drive_applications_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: job_drive_rounds job_drive_rounds_job_drive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_drive_rounds
    ADD CONSTRAINT job_drive_rounds_job_drive_id_fkey FOREIGN KEY (job_drive_id) REFERENCES public.job_drives(id) ON DELETE CASCADE;


--
-- Name: job_drives job_drives_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_drives
    ADD CONSTRAINT job_drives_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: placed_students placed_students_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placed_students
    ADD CONSTRAINT placed_students_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- Name: placed_students placed_students_job_drive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placed_students
    ADD CONSTRAINT placed_students_job_drive_id_fkey FOREIGN KEY (job_drive_id) REFERENCES public.job_drives(id) ON DELETE CASCADE;


--
-- Name: placement_analytics_data placement_analytics_data_analytics_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placement_analytics_data
    ADD CONSTRAINT placement_analytics_data_analytics_id_fkey FOREIGN KEY (analytics_id) REFERENCES public.placement_analytics(id) ON DELETE CASCADE;


--
-- Name: placement_analytics placement_analytics_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placement_analytics
    ADD CONSTRAINT placement_analytics_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: placement_consents placement_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.placement_consents
    ADD CONSTRAINT placement_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pr_allowlist pr_allowlist_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pr_allowlist
    ADD CONSTRAINT pr_allowlist_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: pr_allowlist pr_allowlist_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pr_allowlist
    ADD CONSTRAINT pr_allowlist_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.users(id);


--
-- Name: pr_allowlists pr_allowlists_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pr_allowlists
    ADD CONSTRAINT pr_allowlists_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: resources resources_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: selection_round_students selection_round_students_selection_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.selection_round_students
    ADD CONSTRAINT selection_round_students_selection_round_id_fkey FOREIGN KEY (selection_round_id) REFERENCES public.selection_rounds(id) ON DELETE CASCADE;


--
-- Name: selection_round_students selection_round_students_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.selection_round_students
    ADD CONSTRAINT selection_round_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: selection_rounds selection_rounds_job_drive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.selection_rounds
    ADD CONSTRAINT selection_rounds_job_drive_id_fkey FOREIGN KEY (job_drive_id) REFERENCES public.job_drives(id) ON DELETE CASCADE;


--
-- Name: test_assignments test_assignments_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.test_assignments
    ADD CONSTRAINT test_assignments_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: test_assignments test_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.test_assignments
    ADD CONSTRAINT test_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: test_submission_answers test_submission_answers_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.test_submission_answers
    ADD CONSTRAINT test_submission_answers_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.test_submissions(id) ON DELETE CASCADE;


--
-- Name: test_submissions test_submissions_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.test_submissions
    ADD CONSTRAINT test_submissions_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: test_submissions test_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.test_submissions
    ADD CONSTRAINT test_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tests tests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: user_marksheets user_marksheets_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_marksheets
    ADD CONSTRAINT user_marksheets_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: verification_status verification_status_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.verification_status
    ADD CONSTRAINT verification_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: TABLE v_users_complete; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.v_users_complete TO PUBLIC;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

\unrestrict HKYh391sHqObKUcxFgtx7ZI3rCwh1lSs6EEc8OMKW6cjm342w4sXQIahfls10Q0

