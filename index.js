var 
	http = require('http'),
	fs = require('fs'),
	formidable = require('formidable');

var configuration = {
	// where should we store the actual files
	storagePath: __dirname+'/storage',  

	// web port to bind to
	webPort: 3000,

	// if you want your file sharing service to be private - you can specify the URL of the hidden upload form URL here. Otherwise set to '/'
	uploadFormPath: '/upload',
};

function randomString(len) {
	var text = "";
	var possible = "0123456789";

	for (var i=0; i < len; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}

var indexHtml=fs.readFileSync(__dirname+'/html/index.html');
var uploadHtml=fs.readFileSync(__dirname+'/html/upload.html');
var uploadedHtml=fs.readFileSync(__dirname+'/html/uploaded.html');
var notFoundHtml=fs.readFileSync(__dirname+'/html/404.html');
var deletedHtml=fs.readFileSync(__dirname+'/html/deleted.html');

function sendHtml(res, httpStatus, html) {
	res.writeHead(httpStatus, {
		'content-type': 'text/html',
		'content-length': html.length
	});
	res.end(html);
}

function sendNotFound(res) {
	sendHtml(res, 404, notFoundHtml);
}

if (!fs.existsSync(configuration.storagePath)) {
	fs.mkdirSync(configuration.storagePath);
}


http.createServer(function(req, res) {
	if (req.url == '/upload' && req.method.toLowerCase() == 'post') {
		var form = new formidable.IncomingForm();

		form.parse(req, function(err, fields, files) {
			if (!files.upload) {
		    sendHtml(res, 200, uploadHtml);
				return;
			}

			var source = files.upload.path;
			var sourceName = files.upload.name;

			var destName = randomString(3)+'-'+randomString(3)+'-'+randomString(3);;
			var destPath = configuration.storagePath + '/' + destName;

			fs.writeFileSync(destPath, fs.readFileSync(source));
			fs.unlinkSync(source);
			var deleteKey = randomString(16);
			fs.writeFileSync(destPath+'.meta', JSON.stringify({
				filename: sourceName,
				deleteKey: deleteKey
			}));

			var _html = uploadedHtml.toString().replace(/%URL%/g, '/'+destName).replace(/%DELETE_URL%/g, '/'+destName+'/'+deleteKey);
			sendHtml(res, 200, _html);
		});

		return;

	} else if (req.url==configuration.uploadFormPath) {
		sendHtml(res, 200, uploadHtml); 
		return;

	} else if (req.url=='/') {
		sendHtml(res, 200, indexHtml);
		return;

	} else if (req.url.length==12) {
		var id = req.url.substr(1,100).replace(/\//g, '');
		var filePath = configuration.storagePath+'/'+id;
		if (fs.existsSync(filePath)) {
			var meta = JSON.parse(fs.readFileSync(filePath+'.meta').toString());

			var stat = fs.statSync(filePath);

			res.writeHead(200, {
				'content-type': 'application/octet-stream',
				'content-disposition': 'inline; filename="' + meta.filename + '"',
				'content-length': stat.size
			});
			res.end(fs.readFileSync(filePath));
		} else { 
			sendNotFound(res);
		}

		return;

	} else if (req.url.length==29) {
		var id = req.url.substr(1,11).replace(/\//g, '');
		var deleteKey = req.url.substr(13,16);

		var filePath = configuration.storagePath+'/'+id;
		if (fs.existsSync(filePath)) {
			try {
				var meta = JSON.parse(fs.readFileSync(filePath+'.meta').toString());
				if (meta.deleteKey == deleteKey) {
					fs.unlinkSync(filePath+'.meta');
					fs.unlinkSync(filePath);
					sendHtml(res, 200, deletedHtml);
					return;
				} 
			} catch (e) {
			}
		}

		sendNotFound(res);
		return;

	} else { 
		sendNotFound(res);
		return;
	}
}).listen(configuration.webPort);

console.log("Listening on port %d", configuration.webPort);

