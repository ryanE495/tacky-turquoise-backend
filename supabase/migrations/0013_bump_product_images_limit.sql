-- Raise the product-images bucket file size cap from 10MB to 50MB so
-- camera photos uploaded directly from a phone don't get rejected.
-- Direct-to-Supabase uploads via signed URLs still go through this cap;
-- nothing else relies on the old number.
update storage.buckets
   set file_size_limit = 52428800
 where id = 'product-images';
