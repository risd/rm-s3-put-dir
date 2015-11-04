var fs = require('fs');
var through = require('through2');
var from = require('from2-array');

module.exports = RmS3PutDir;

function RmS3PutDir (opts) {

	var aws = require('aws-sdk');
	var s3 = require('s3');

    // Ensure you have a directory to upload to
    var e;
    if (!('directory' in opts)) {
        e = [
            'RmS3PutDir requires a `directory`',
            'key in its options.'
        ];
        throw new Error(e.join('\n'));
    }

    // Ensure you have aws credentials.
    var hasAws = false;
    if ('aws' in opts) {
        if (('key'    in opts.aws) &&
            ('secret' in opts.aws)) {
            hasAws = true;
        }
    }
    if (hasAws === false) {
        e = [
            'The configuration file referenced does not',
            'contain aws credentials. Your conf file should',
            'be JSON, and have two keys. `key` & `secret`.',
            '`key` is your public aws key, `secret` is',
            'secret key.',
            ''
        ];
        throw new Error(e.join('\n'));
    }

    if (!('bucket' in opts)) {
        e = [
            'RmS3PutDir requires a `bucket`',
            'key in its options.'
        ];
        throw new Error(e.join('\n'));
    }
	
	aws.config.update({ accessKeyId: opts.aws.key,
                    	secretAccessKey: opts.aws.secret });

    opts.keyPrefix = opts.keyPrefix || '';
    opts.verbose = opts.verbose || false;

	var awsS3 = new aws.S3();

	return from.obj([{
            directory: opts.directory,
            bucket:    opts.bucket,
            keyPrefix: opts.keyPrefix,
			verbose:   opts.verbose
		}])
		.pipe(CreateBucketWithS3(awsS3))
        .pipe(SetBucketPolicyWithS3(awsS3))
        .pipe(FindFiles(opts.directory))
        .pipe(UploadFiles(awsS3, opts));
}

function CreateBucketWithS3 (s3) {
    var params = {
        ACL: 'public-read'
    };

    return through.obj(createBucket);

    function createBucket (conf, enc, next) {

    	if (conf.verbose) {
    		var m = [
	            'Ensuring S3 bucket exists.'
	        ];
	        console.log(m.join(''));
    	}

        var self = this;
        if (conf.bucket === false) {
            var e = [
                'Creating S3 bucket requires ',
                'a name, in this case, the ',
                'current git branch.'
            ];
            throw new Error(e.join(''));
        } else {
            params.Bucket = conf.bucket;
            s3.createBucket(params, finish);
        }

        function finish (err, data) {
            if (err) {
                console.log(err, err.stack);
                throw new Error('Error creating bucket.');
            }
            self.push(conf);
            next();
        }
    }
}

function SetBucketPolicyWithS3 (s3) {
    function params (bucketName) {
        var p = {
            "Version": "2012-10-17",
            "Statement": [{
                "Sid": "PublicReadGetObject",
                "Effect": "Allow",
                "Principal": "*",
                "Action": ["s3:GetObject"],
                "Resource": ["arn:aws:s3:::" +
                              bucketName +"/*"]
            }]
        };

        return {
            Bucket: bucketName,
            Policy: JSON.stringify(p)
        };
    }

    return through.obj(plcy);

    function plcy (conf, enc, next) {
        var self = this;

        if (conf.verbose) {
        	var m = [
	            'Configuring S3 bucket policy for',
	            'public read.'
	        ];
	        console.log(m.join(''));
        }

        if (conf.bucket === false) {
            var e = [
                'Requires a bucket to have been made ',
                'before it can be configured for ',
                'static hosting.'
            ];
            throw new Error(e.join(''));
        } else {
            conf.policyConfig = params(conf.bucket);
            s3.putBucketPolicy(
                    conf.policyConfig,
                    finish);
        }

        function finish (err, data) {
            if (err) {
                conf.policyConfig = false;
                console.log(err);
                console.log(err.stack);
                throw new Error(err);
            }
            self.push(conf);
            next();
        }
    }
}

function FindFiles(directory) {
    var findit = require('findit');
    return through.obj(f);

    function f (conf, enc, next) {
        var stream = this;

        var finder = findit(directory);

        finder.on('file', function (filePath, stat) {
            stream.push(filePath);
        });
        finder.on('end', function () {
            stream.push(null);
            next();
        });
    }
}

function UploadFiles (s3, conf) {
	var s3stream = require('s3-upload-stream')(s3);
	var mime = require('mime');

	return through.obj(uploads);

	function uploads (filePath, enc, next) {
		var stream = this;

		if (conf.verobse) {
			var m = [
				'Uploading:',
				filePath,
				('to s3 bucket ' + conf.bucket)
			];
			console.log(m.join('\n'));
		}
		var uploader = s3stream.upload({
			Bucket: conf.bucket,
			Key: conf.keyPrefix + filePath,
			ContentType: mime.lookup(filePath)
		});
		uploader.on('error', function (err) {
			console.log(err);
		});
		uploader.on('uploaded', function (details) {
            stream.push(details);
			next();
		});
		
		fs.createReadStream(process.cwd() + '/' + filePath).pipe(uploader);
	}
}
