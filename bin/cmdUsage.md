rm-s3-put-dir directory
    --bucket
    --aws
    --keyPrefix

`directory`   The path to the file to upload.
              Required.

`bucket`      The name of the bucket to put files into.
              Required.

`aws`         Path to JSON file with AWS credentials.
              Default is `~/.risdmedia/aws.json`.
              Expects two keys: `key` & `secret`.
              Required.

`keyPrefix`   Prefix for each file uploaded to
              the bucket.

Example

./bin/cmd public --bucket=risdmedia-assets
