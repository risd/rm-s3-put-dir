rm-s3-put-dir directory
    --bucket
    --aws
    --origin

`directory`   The path to the file to upload.
              Required.

`bucket`      The name of the bucket to put files into.
              Required.

`aws`         Path to JSON file with AWS credentials.
              Default is `~/.risdmedia/aws.json`.
              Expects two keys: `key` & `secret`.
              Required.

`origins`     Comma seperated list of the domains to allow
              to allow GET requests from.

Example

./bin/cmd public --bucket=risdmedia-assets --origin=*.webhook.org,risd.edu
