-- Raise the media bucket file size cap from 10MB to 50MB.
update storage.buckets
   set file_size_limit = 52428800
 where id = 'media';
