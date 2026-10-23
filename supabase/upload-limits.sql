-- =====================================================================
-- Evergreen CRM - Upload limits. Safe to run again.
-- Every file bucket takes at most 10 MB per file, and only normal document,
-- photo, audio and video types. Zip / rar / 7z files are refused here, so the
-- only way in is through the CRM, which unpacks zips first (lib/uploadRules.js).
-- Files already stored are not touched.
-- ID photos (5 MB) and the Academy training video (50 MB) keep their own limits.
-- =====================================================================
update storage.buckets
set file_size_limit = 10485760,   -- 10 MB
    allowed_mime_types = array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/rtf',
      'text/plain', 'text/csv',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/tiff',
      'audio/mpeg', 'audio/mp4', 'video/mp4', 'video/quicktime'
    ]
where id in ('documents', 'staff-files', 'launch-files', 'policies');

-- Check: should list the 4 buckets with 10485760
select id, file_size_limit, array_length(allowed_mime_types, 1) as types_allowed
from storage.buckets where id in ('documents', 'staff-files', 'launch-files', 'policies');
