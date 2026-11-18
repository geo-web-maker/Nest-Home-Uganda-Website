# Template data keys

Filled automatically (do not ask the nurse to type these):

- `patient.name|dob|record_id|type|phone|email|language|address` and `patient.caregiver.*`, `patient.emergency.*` from the patient record.
- `author.name` and `author.registration_line` (UNMC number, category, licence expiry) from the nurse profile.
- `org.name|short_name|city|phone|privacy_email|pdpo_ref|mark_svg` from organisation / mail settings.
- `copy.*` (sent_at, channel, to) when a copy has been emailed or handed over.
- `prefill.<key>` defaults per form (see `backend/care_forms_context.py`); anything saved in `v.<key>` overrides them.

Typed or captured by the nurse and client: `v.<key>` values below and `sig.<role>.*` (client also `esign`). Methods: drawn, biometric, password, thumbprint.


## Form 01. Registration and contact arrangements

- `v.home_service_address_and_directions` Home / service address and directions
- `v.patient_telephone` Patient telephone
- `v.preferred_language` Preferred language
- `v.communication_accessibility_support_requ` Communication / accessibility support required
- `v.referring_clinician_facility_and_contact` Referring clinician / facility and contact
- `v.reason_for_referral_and_documents_receiv` Reason for referral and documents received
- `v.primary_caregiver` Primary caregiver
- `v.caregiver_relationship` Caregiver relationship
- `v.caregiver_telephone` Caregiver telephone
- `v.available_care_hours` Available care hours
- `v.emergency_contact` Emergency contact
- `v.emergency_contact_relationship` Emergency contact relationship
- `v.emergency_contact_telephone` Emergency contact telephone
- `v.alternative_contact` Alternative contact
- `v.payer_client_name_and_service_agreement_` Payer / client name and Service Agreement reference
- `v.allergies_reactions` one of: Known / None known / Not yet established
- `v.substance_reaction_and_severity` Substance, reaction and severity
- `v.urgent_concerns_or_immediate_referral_ac` Urgent concerns or immediate referral action
- `v.identity_checked_using_two_identifiers` one of: Yes
- signatures: staff

## Form 02. Initial nursing assessment

- `v.consent_to_this_assessment_obtained_form` Consent to this assessment obtained (Form 03 reference)
- `v.presenting_concerns_and_patient_prioriti` Presenting concerns and patient priorities
- `v.relevant_diagnoses_history_recent_surger` Relevant diagnoses / history, recent surgery / admission and discharge instructions
- `v.medicines_including_non_prescription_her` Medicines including non-prescription / herbal products, and source checked
- `v.allergies_and_reactions` Allergies and reactions
- `v.verified_with` Verified with
- `v.time` Time
- `v.temperature_c` Temperature C
- `v.pulse_min` Pulse /min
- `v.respirations_min` Respirations /min
- `v.bp_mmhg` BP mmHg
- `v.spo2` SpO2 %
- `v.room_air_oxygen_device_and_flow` Room air / oxygen device and flow
- `v.pain_score_tool` Pain score / tool
- `v.glucose_mmol_l_if_indicated` Glucose mmol/L if indicated
- `v.weight_kg` Weight kg
- `v.consciousness_breathing_circulation_symp` Consciousness, breathing / circulation, symptoms and action on abnormal findings
- `v.mobility_falls_skin_pressure_risk_nutrit` Mobility / falls; skin / pressure risk; nutrition / swallowing; hydration and elimination
- `v.cognition_communication_emotional_needs_` Cognition / communication; emotional needs; safeguarding; cultural preferences
- `v.devices_wounds_infection_precautions_and` Devices, wounds, infection precautions and specialist assessments needed
- `v.caregiver_capacity_safe_access_water_hyg` Caregiver capacity; safe access; water / hygiene; equipment; sharps / waste arrangements
- `v.risks_identified_safeguards_and_responsi` Risks identified, safeguards and responsible person
- `v.home_care_suitable` one of: Yes / Yes with conditions / Referral required
- `v.conditions_referral_responsible_clinicia` Conditions / referral, responsible clinician and review time
- signatures: nurse

## Form 03. Consent to the agreed nursing care

- `v.care_plan_reference_version_and_proposed` Care plan reference / version and proposed care
- `v.expected_benefits_material_risks_and_lim` Expected benefits, material risks and limitations discussed
- `v.reasonable_alternatives_including_no_car` Reasonable alternatives, including no care, and likely consequences
- `v.questions_answers_patient_preferences_an` Questions, answers, patient preferences and limits on consent
- `v.decision_maker` one of: Patient decides for themselves / Parent or person with lawful authority
- `v.decision_specific_capacity_assessed_by` Decision-specific capacity assessed by
- `v.date_time` Date / time
- `v.support_interpreter_provided_and_finding` Support / interpreter provided and findings
- `v.if_the_patient_is_under_18_parent_or_leg` If the patient is under 18: parent or legal guardian, relationship and evidence of authority
- `v.if_another_person_signs_name_relationshi` If another person signs: name, relationship, legal basis and evidence of authority
- `v.patient_involvement_or_child_assent_wher` Patient involvement or child assent where appropriate; concerns / disagreement
- signatures: client,interpreter,witness,nurse
- `v.copy_given_on` Copy given on
- `v.sent_by_auto_email_paper` Sent by (auto-email / paper)
- `v.sent_to_email` Sent to (email)

## Form 04. Specific procedure consent

- `v.procedure_and_clinical_reason_site_side_` Procedure and clinical reason; site / side where applicable
- `v.practitioner_and_required_clinical_order` Practitioner and required clinical order / prescription reference
- `v.proposed_date_or_course_duration_and_fre` Proposed date, or course duration and frequency
- `v.expected_benefits_and_patient_specific_m` Expected benefits and patient-specific material risks
- `v.alternatives_and_consequences_of_delayin` Alternatives and consequences of delaying or declining
- `v.preparation_pain_management_aftercare_an` Preparation, pain management, aftercare and warning signs explained
- `v.questions_answers_and_restrictions_reque` Questions, answers and restrictions requested by the patient
- `v.capacity_authority` one of: Patient / Verified representative (or parent  /  guardian of a patient under 18)
- `v.if_representative_name_and_authority_evi` If representative: name and authority evidence / reference
- `v.interpreter_support_used` Interpreter / support used
- signatures: client,interpreter,witness,nurse
- `v.identity_and_site_checked` one of: Yes
- `v.current_consent_confirmed` one of: Yes
- `v.relevant_order_allergies_equipment_and_s` one of: Yes
- `v.changes_since_discussion_and_action_take` Changes since discussion and action taken
- `v.proceed` one of: Yes / No
- `v.practitioner_initials` Practitioner initials
- `v.date_time` Date / time
- `v.visit_sheet_form_07_reference` Visit sheet (Form 07) reference

## Form 05. Privacy notice and communication choices

- `v.personal_data_protection_office_registra` Personal Data Protection Office registration reference (if applicable)
- table `v.t_r1c1` to `v.t_r4c3`: Recipient and contact, Information permitted and purpose, Expiry or limits
- `v.channel` one of: Telephone / SMS / WhatsApp / Email / In person  /  paper
- `v.verified_number_email` Verified number / email
- `v.safe_time_to_contact_and_restrictions` Safe time to contact and restrictions
- `v.photographs` one of: I agree to the specific clinical photographs described below / I decline
- `v.purpose_body_area_authorised_recipients_` Purpose / body area, authorised recipients and storage
- `v.authority_reference` Authority reference
- signatures: client,interpreter,witness,nurse

## Form 06. Individual nursing care plan

- `v.plan_reference_version` Plan reference / version
- `v.effective_from` Effective from
- `v.review_due` Review due
- `v.lead_clinician` Lead clinician
- `v.patient_goals_and_agreed_service_scope` Patient goals and agreed service scope
- `v.visits_shifts_and_duration` Visits / shifts and duration
- `v.responsible_nurse_team` Responsible nurse / team
- `v.consent_form_reference_form_03` Consent form reference (Form 03)
- `v.clinical_orders_attached` Clinical orders attached
- `v.supplies_equipment_medicines_and_who_pro` Supplies, equipment, medicines and who provides each
- `v.caregiver_tasks_and_training_required_ta` Caregiver tasks and training required; tasks reserved for qualified staff
- table `v.t_r1c1` to `v.t_r6c4`: Need or problem, Agreed intervention and frequency, Responsible person, Goal and review date
- `v.individual_warning_signs_or_observation_` Individual warning signs or observation limits set by the responsible clinician
- `v.action_contact_for_deterioration` Action / contact for deterioration
- `v.bloomwell_clinical_contact` BLOOMWELL clinical contact
- `v.clinical_contact_tel` Clinical contact tel
- `v.treating_clinician_facility` Treating clinician / facility
- `v.treating_clinician_tel` Treating clinician tel
- `v.emergency_transport_arrangement_contact` Emergency transport arrangement / contact
- `v.patient_representative_involvement_and_a` Patient / representative involvement and agreement
- signatures: client,nurse

## Form 07. Nursing visit and observation record

- `v.visit_date` Visit date
- `v.arrival_time` Arrival time
- `v.departure` Departure
- `v.location` Location
- `v.nurse_name_unmc_number` Nurse name / UNMC number
- `v.care_plan_version` Care plan version
- `v.allergies_checked` Allergies checked
- `v.two_patient_identifiers_checked` one of: Yes
- `v.current_consent_confirmed` one of: Yes
- `v.patient_concerns_and_change_since_last_v` Patient concerns and change since last visit
- table `v.t_r1c1` to `v.t_r6c3`: Time, Observations with units and relevant symptoms, Action and response
- `v.interventions_patient_response_and_devia` Interventions, patient response and deviations from the care plan
- `v.medicines_recorded_on_form_08_reference` Medicines recorded on Form 08 / reference
- `v.wound_procedure_record_reference` Wound / procedure record reference
- `v.advice_given_understanding_checked_and_c` Advice given, understanding checked and caregiver tasks
- `v.concern_reported_to_whom_when_advice_rec` Concern reported to whom / when; advice received and follow-up responsibility
- `v.next_visit_review` Next visit / review
- `v.handover_to` Handover to
- signatures: nurse,client

## Form 08. Medication administration record

- `v.allergy_status_and_reaction` Allergy status and reaction
- `v.patient_identifiers_verified` Patient identifiers verified
- `v.care_plan_reference` Care plan reference
- `v.medicine_name` Medicine name
- `v.form_strength` Form / strength
- `v.dose_and_unit` Dose and unit
- `v.route` Route
- `v.frequency_times` Frequency / times
- `v.start_date` Start date
- `v.stop_review` Stop / review
- `v.indication` Indication
- `v.prescriber_name_contact` Prescriber name / contact
- `v.signed_order_reference_date_and_location` Signed order reference / date and location
- `v.if_as_needed_indication_minimum_interval` If as needed: indication, minimum interval and maximum dose in 24 hours per the order
- `v.special_instructions_monitoring` Special instructions / monitoring
- `v.order_checked_by` Order checked by
- `v.date_time` Date / time
- table `v.t_r1c1` to `v.t_r10c6`: Date and due time, Actual time, Dose and route given, Given or code, Initials, Response or action reference
- `v.omission_reaction_clinical_instruction_o` Omission, reaction, clinical instruction or response details
- `v.order_changed_stopped_by` Order changed / stopped by
- `v.change_date_time` Change date / time
- `v.new_verified_order_reference` New verified order reference
- signatures: nurse

## Form 09. Wound and dressing care record

- `v.wound_id_site_side` Wound ID / site / side
- `v.onset_surgery_date` Onset / surgery date
- `v.diagnosis_type_as_documented` Diagnosis / type as documented
- `v.order_care_plan_reference` Order / care plan reference
- `v.consent_confirmed` Consent confirmed
- `v.allergies_checked` Allergies checked
- `v.assessment_time` Assessment time
- `v.length_cm` Length cm
- `v.width_cm` Width cm
- `v.depth_cm` Depth cm
- `v.measurement_method_position` Measurement method / position
- `v.wound_bed_edges_surrounding_skin_undermi` Wound bed; edges; surrounding skin; undermining / tunnelling if assessed
- `v.exudate_amount_type_odour_after_cleansin` Exudate amount / type, odour after cleansing and signs of infection or deterioration
- `v.pain_score_tool_before` Pain score / tool before
- `v.after_care` After care
- `v.other_relevant_observations` Other relevant observations
- `v.cleansing_dressing_products_technique_an` Cleansing, dressing / products, technique and applicable clinical order
- `v.tolerance_response_concerns_and_escalati` Tolerance, response, concerns and escalation
- `v.advice_protection_offloading_caregiver_r` Advice, protection / offloading, caregiver role and understanding checked
- `v.photograph_taken` one of: No / Yes, with separate clinical permission (Form 05, Part D)
- `v.image_reference_and_secure_location` Image reference and secure location
- `v.next_dressing_review_date` Next dressing / review date
- `v.responsible_clinician` Responsible clinician
- `v.referral_contact_and_time_if_indicated` Referral / contact and time if indicated
- signatures: nurse

## Form 10. Incident, emergency and referral record

- `v.event_date_time` Event date / time
- `v.place` Place
- `v.type` one of: Deterioration / Medication / Fall  /  injury / Safeguarding / Other
- `v.what_happened_observed_findings_and_info` What happened, observed findings and information source
- `v.immediate_action_time_response_and_perso` Immediate action, time, response and persons involved
- `v.emergency_clinical_assistance_contacted` Emergency / clinical assistance contacted
- `v.time` Time
- `v.advice_instructions_source_and_action_ta` Advice / instructions, source and action taken
- `v.patient_or_authorised_representative_inf` Patient or authorised representative informed; consent / refusal and time
- `v.basis_and_circumstances_if_applicable` Basis and circumstances if applicable
- `v.reportable_event` one of: Death (certified by a registered medical practitioner, never by the nurse) / Notifiable disease / Suspected abuse  /  safeguarding concern / Other legal or professional duty / None identified
- `v.reported_to_authority_professional_body_` Reported to (authority, professional body or facility), by whom, and when
- `v.patient_family_told_what_happened_and_wh` Patient / family told what happened and what is being done
- `v.privacy_incident_lost_record_misdirected` one of: No / Yes, reported under Service Agreement clause 12.5
- `v.privacy_incident_reported_on` Privacy incident reported on
- `v.receiving_facility_clinician` Receiving facility / clinician
- `v.contact` Contact
- `v.acceptance_confirmed_by_at` Acceptance confirmed by / at
- `v.transport_escort_and_departure_time` Transport / escort and departure time
- `v.condition_at_transfer_medicines_last_giv` Condition at transfer, medicines last given and documents sent
- `v.handover_received_by_time` Handover received by / time
- `v.if_transfer_delayed_or_declined_actions_` If transfer delayed or declined: actions and safety plan
- `v.bloomwell_notified_by_to_time` BLOOMWELL notified by / to / time
- `v.follow_up_owner_and_deadline` Follow-up owner and deadline
- signatures: nurse

## Form 11. Refusal or withdrawal of consent

- `v.decision_recorded_at_date_time` Decision recorded at date / time
- `v.person_deciding_and_role` Person deciding and role
- `v.care_procedure_referral_permission_decli` Care / procedure / referral / permission declined or withdrawn
- `v.reason_in_the_person_s_own_words_if_they` Reason in the person's own words, if they wish to give one
- `v.decision_specific_capacity_communication` Decision-specific capacity, communication support and authority if represented
- `v.benefits_material_risks_of_refusal_alter` Benefits, material risks of refusal, alternatives and questions discussed
- `v.understanding_checked_remaining_concerns` Understanding checked; remaining concerns; further advice obtained
- `v.care_still_accepted_alternatives_safe_st` Care still accepted, alternatives, safe stopping / handover and follow-up
- `v.warning_signs_and_how_where_to_obtain_ur` Warning signs and how / where to obtain urgent assistance
- `v.signing` one of: Signed / Declined to sign / Unable to sign / Verbal decision recorded
- `v.reason_and_witness_details_where_appropr` Reason and witness details where appropriate
- signatures: client,interpreter,witness,nurse

## Form 12. Discharge, transfer and care handover

- `v.care_episode_from` Care episode from
- `v.to` To
- `v.reason_for_ending_transfer` Reason for ending / transfer
- `v.receiving_provider_or_caregiver` Receiving provider or caregiver
- `v.contact` Contact
- `v.summary_of_condition_care_provided_and_p` Summary of condition, care provided and progress against goals
- `v.outstanding_problems_and_current_care_ne` Outstanding problems and current care needs
- `v.current_verified_medication_list_order_a` one of: Yes / Not applicable
- `v.reference_date` Reference / date
- `v.allergies_reactions` Allergies / reactions
- `v.changes_last_doses_next_doses_due_and_re` Changes, last doses, next doses due and responsibility for administration
- `v.ongoing_wound_device_care_equipment_and_` Ongoing wound / device care, equipment and supplies
- `v.review_appointment` Review appointment
- `v.provider_contact` Provider / contact
- `v.pending_results_actions_and_named_respon` Pending results / actions and named responsible person
- `v.warning_signs_emergency_action_and_conta` Warning signs, emergency action and contact arrangements explained
- `v.patient_caregiver_understanding_and_abil` Patient / caregiver understanding and ability to continue care checked
- `v.documents_care_summary_supplied` Documents / care summary supplied
- `v.equipment_property_returned_or_transferr` Equipment / property returned or transferred
- `v.receiving_person_name_and_role` Receiving person name and role
- signatures: nurse,receiver,client
- `v.copy_supplied_to_patient_authorised_reci` Copy supplied to patient / authorised recipient on
- `v.form_pack_version` Form pack version
- `v.effective_from` Effective from
- `v.next_review_due` Next review due
- `v.approved_by_bloomwell_clinical_lead` Approved by (BLOOMWELL clinical lead)

## Weekly trackers (tracker-baby / tracker-mama)

Built by `tracker_context()`: 14 rows (7 days x AM/PM), mama care grid, notes. Only for patients set as Baby or Mama; General patients have no tracker.
