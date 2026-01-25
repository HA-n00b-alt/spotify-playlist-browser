UPDATE track_bpm_cache
SET bpm_selected = CASE
  WHEN bpm_manual IS NOT NULL THEN 'manual'
  WHEN bpm_essentia IS NOT NULL THEN 'essentia'
  WHEN bpm_librosa IS NOT NULL THEN 'librosa'
  ELSE bpm_selected
END
WHERE (bpm_selected IS NULL OR bpm_selected NOT IN ('essentia', 'librosa', 'manual'))
  AND (bpm_manual IS NOT NULL OR bpm_essentia IS NOT NULL OR bpm_librosa IS NOT NULL);
