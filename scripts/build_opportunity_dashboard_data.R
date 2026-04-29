#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(dplyr)
  library(jsonlite)
  library(readr)
  library(sf)
  library(tigris)
})

options(tigris_use_cache = TRUE)

root_dir <- normalizePath(".", winslash = "/", mustWork = TRUE)
input_csv <- file.path(root_dir, "opportunity data", "cbsa_master_table.csv")
national_input_csv <- file.path(root_dir, "opportunity data", "cbsa_metropolitan_national_coi_scores.csv")
output_dir <- file.path(root_dir, "dashboards", "opportunity", "data")

dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

wrap_js_assignment <- function(target, payload) {
  paste0(
    "window.__OPPORTUNITY_DASHBOARD__ = window.__OPPORTUNITY_DASHBOARD__ || { summary: null, cbsa: null };\n",
    target,
    " = ",
    payload,
    ";\n"
  )
}

metric_pairs <- list(
  gap_coi_idx = c("hcv_coi_idx", "renter_coi_idx"),
  gap_coi_edu = c("hcv_coi_edu", "renter_coi_edu"),
  gap_coi_health_env = c("hcv_coi_health_env", "renter_coi_health_env"),
  gap_coi_eco = c("hcv_coi_eco", "renter_coi_eco")
)

meta_cols <- c(
  "cbsa_code",
  "cbsa_name",
  "cbsa_name_full",
  "cbsa_type",
  "is_metropolitan",
  "is_micropolitan"
)

source_metric_cols <- unique(unlist(metric_pairs, use.names = FALSE))
selected_cols <- c(meta_cols, source_metric_cols)

message("Reading CBSA opportunity source table...")
raw_data <- read_csv(
  input_csv,
  show_col_types = FALSE,
  col_types = cols(.default = col_character())
)

clean_numeric <- function(x) {
  suppressWarnings(as.numeric(x))
}

clean_flag <- function(x) {
  normalized <- trimws(tolower(as.character(x)))
  ifelse(
    normalized %in% c("1", "true", "t", "yes"),
    1,
    ifelse(normalized %in% c("0", "false", "f", "no"), 0, NA_real_)
  )
}

cbsa_data <- raw_data %>%
  select(all_of(selected_cols)) %>%
  mutate(
    across(all_of(source_metric_cols), clean_numeric),
    is_metropolitan = clean_flag(is_metropolitan),
    is_micropolitan = clean_flag(is_micropolitan)
  ) %>%
  filter(is_metropolitan == 1) %>%
  mutate(
    gap_coi_idx = hcv_coi_idx - renter_coi_idx,
    gap_coi_edu = hcv_coi_edu - renter_coi_edu,
    gap_coi_health_env = hcv_coi_health_env - renter_coi_health_env,
    gap_coi_eco = hcv_coi_eco - renter_coi_eco
  )

cbsa_shapes <- core_based_statistical_areas(year = 2023, cb = TRUE, class = "sf") %>%
  st_transform(4326) %>%
  transmute(
    cbsa_code = GEOID,
    shape_name = NAME,
    shape_name_full = NAMELSAD,
    geometry = geometry
  )

cbsa_geo <- cbsa_shapes %>%
  inner_join(cbsa_data, by = "cbsa_code") %>%
  mutate(
    cbsa_name = ifelse(is.na(cbsa_name) | cbsa_name == "", shape_name, cbsa_name),
    cbsa_name_full = ifelse(
      is.na(cbsa_name_full) | cbsa_name_full == "",
      shape_name_full,
      cbsa_name_full
    ),
    cbsa_type = ifelse(is.na(cbsa_type) | cbsa_type == "", shape_name_full, cbsa_type)
  ) %>%
  select(
    cbsa_code,
    cbsa_name,
    cbsa_name_full,
    cbsa_type,
    is_metropolitan,
    is_micropolitan,
    all_of(source_metric_cols),
    gap_coi_idx,
    gap_coi_edu,
    gap_coi_health_env,
    gap_coi_eco,
    geometry
  ) %>%
  arrange(cbsa_name_full)

summary_metrics <- c(source_metric_cols, names(metric_pairs))

summarise_metric_set <- function(df) {
  stats <- lapply(summary_metrics, function(metric) {
    values <- df[[metric]]
    if (all(is.na(values))) {
      return(NA_real_)
    }

    mean(values, na.rm = TRUE)
  })

  names(stats) <- summary_metrics
  stats
}

build_national_summary <- function(path) {
  if (!file.exists(path)) {
    return(NULL)
  }

  national_raw <- read_csv(
    path,
    show_col_types = FALSE,
    col_types = cols(.default = col_character())
  )

  metric_lookup <- c(
    "hcv_weighted_metro_national_coi_idx" = "hcv_coi_idx",
    "renter_weighted_metro_national_coi_idx" = "renter_coi_idx",
    "hcv_weighted_metro_national_coi_edu" = "hcv_coi_edu",
    "renter_weighted_metro_national_coi_edu" = "renter_coi_edu",
    "hcv_weighted_metro_national_coi_health_env" = "hcv_coi_health_env",
    "renter_weighted_metro_national_coi_health_env" = "renter_coi_health_env",
    "hcv_weighted_metro_national_coi_eco" = "hcv_coi_eco",
    "renter_weighted_metro_national_coi_eco" = "renter_coi_eco"
  )

  score_map <- national_raw %>%
    mutate(
      metric = trimws(metric),
      score = clean_numeric(score)
    ) %>%
    filter(metric %in% names(metric_lookup)) %>%
    transmute(target_metric = unname(metric_lookup[metric]), score) %>%
    distinct(target_metric, .keep_all = TRUE)

  national_summary <- as.list(rep(NA_real_, length(summary_metrics)))
  names(national_summary) <- summary_metrics

  for (i in seq_len(nrow(score_map))) {
    national_summary[[score_map$target_metric[[i]]]] <- score_map$score[[i]]
  }

  national_summary$gap_coi_idx <- national_summary$hcv_coi_idx - national_summary$renter_coi_idx
  national_summary$gap_coi_edu <- national_summary$hcv_coi_edu - national_summary$renter_coi_edu
  national_summary$gap_coi_health_env <- national_summary$hcv_coi_health_env - national_summary$renter_coi_health_env
  national_summary$gap_coi_eco <- national_summary$hcv_coi_eco - national_summary$renter_coi_eco

  national_summary
}

national_summary <- build_national_summary(national_input_csv)
if (is.null(national_summary)) {
  national_summary <- summarise_metric_set(st_drop_geometry(cbsa_geo))
}

summary_payload <- list(
  feature_count = nrow(cbsa_geo),
  national = national_summary
)

geojson_path <- file.path(output_dir, "cbsa.geojson")
if (file.exists(geojson_path)) {
  file.remove(geojson_path)
}

st_write(
  cbsa_geo,
  geojson_path,
  driver = "GeoJSON",
  quiet = TRUE,
  layer_options = c("RFC7946=YES", "COORDINATE_PRECISION=5", "WRITE_BBOX=NO")
)

cbsa_payload <- paste(readLines(geojson_path, warn = FALSE), collapse = "\n")
writeLines(
  wrap_js_assignment("window.__OPPORTUNITY_DASHBOARD__.cbsa", cbsa_payload),
  file.path(output_dir, "cbsa.js")
)

write_json(
  summary_payload,
  file.path(output_dir, "summary.json"),
  auto_unbox = TRUE,
  pretty = TRUE,
  na = "null"
)

summary_payload_json <- paste(readLines(file.path(output_dir, "summary.json"), warn = FALSE), collapse = "\n")
writeLines(
  wrap_js_assignment("window.__OPPORTUNITY_DASHBOARD__.summary", summary_payload_json),
  file.path(output_dir, "summary.js")
)

message("CBSA opportunity dashboard data generated in ", output_dir)
