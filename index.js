var debug = require('debug')('rm-s3-put-dir');

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

	var awsS3 = new aws.S3();

    var source = from.obj([{
            directory: opts.directory,
            bucket:    opts.bucket,
            keyPrefix: opts.keyPrefix,
            isWebsite: opts.isWebsite,
            gitSuffix: opts.gitSuffix
        }]);

    var pipeline = [source];

    if (opts.gitSuffix)
        pipeline = pipeline
            .concat([GitSuffix()]);

    pipeline = pipeline
        .concat([
            CreateBucketWithS3(awsS3),
            SetBucketPolicyWithS3(awsS3)
        ]);

    if (opts.isWebsite)
        pipeline = pipeline
            .concat([SetWebsiteConfigWithS3(awsS3)])

    pipeline = pipeline
        .concat([
            FindFiles(opts.directory),
            UploadFiles(awsS3, opts)
        ]);

	return pump.apply(null, pipeline);
}

function GitSuffix () {
    var git = require('git-rev');
    return through.obj(appendBranch);

    function appendBranch (conf, enc, next) {
        var stream = this;
        git.branch(function (branch) {
            conf.bucket = conf.bucket + '-' +
                branch.toLowerCase().replace(/ /g, '-');

            stream.push(conf);
            next();
        });
    }
}

function CreateBucketWithS3 (s3) {
    var params = {
        ACL: 'public-read'
    };

    return through.obj(createBucket);

    function createBucket (conf, enc, next) {

		var m = [
            'Ensuring S3 bucket exists.'
        ];
        debug(m.join(''));

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
                debug(err, err.stack);
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

    	var m = [
            'Configuring S3 bucket policy for',
            'public read.'
        ];
        debug(m.join(''));

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
                debug(err);
                debug(err.stack);
                throw new Error(err);
            }
            self.push(conf);
            next();
        }
    }
}

function SetWebsiteConfigWithS3 (s3) {
    var params = {
        WebsiteConfiguration: {
            IndexDocument: { Suffix: 'index.html' },
            ErrorDocument: { Key: '404.html' }
        }
    };
    function url (bucketName) {
        return [
            'http://',
            bucketName,
            '.s3-website-us-east-1.amazonaws.com'
        ].join('');
    }

    return through.obj(websiteConig);

    function websiteConig (conf, enc, next) {
        var self = this;

        var m = [
            'Configuring S3 bucket for static hosting.'
        ];
        debug(m.join(''));

        if (conf.bucket === false) {
            var e = [
                'Requires a bucket to have been made ',
                'before it can be configured for ',
                'static hosting.'
            ];
            throw new Error(e.join(''));
        } else {
            params.Bucket = conf.bucketName;
            s3.putBucketWebsite(params, finish);
        }

        function finish (err, data) {
            if (err) {
                debug(err);
                debug(err.stack);
                throw new Error(err);
            } else {
                conf.websiteConfig = params;
                conf.url = url(conf.bucketName);
                console.log(conf.url);
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

		var m = [
			'Uploading:',
			filePath,
			('to s3 bucket ' + conf.bucket)
		];
		debug(m.join('\n'));

		var uploader = s3stream.upload({
			Bucket: conf.bucket,
			Key: conf.keyPrefix + filePath,
			ContentType: mime.lookup(filePath)
		});
		uploader.on('error', function (err) {
			debug(err);
		});
		uploader.on('uploaded', function (details) {
            stream.push(details);
			next();
		});
		
		fs.createReadStream(process.cwd() + '/' + filePath).pipe(uploader);
	}
}
