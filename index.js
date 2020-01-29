// Connection string
// ssh -i ~/.ssh/do_again root@206.189.126.3

const util = require('util');
var app = require('express')();
const fs = require('fs');
var http = require('http').Server(app);
var bodyParser = require('body-parser');
var mongoose = require('mongoose');

var version = '2030';

var mongoDBUrl = `mongodb+srv://${process.env.mongodb_username}:${process.env.mongodb_password}@cluster0-ti9su.mongodb.net/codecollection?retryWrites=true&w=majority`;

var db = mongoose.connection;
var Schema = mongoose.Schema;
var cc = mongoose.model('codes', new Schema({}, {"strict": false}));

app.use(bodyParser.raw({limit: '100mb'}));
app.use(bodyParser.json({limit: '100mb'}));
app.use(bodyParser.urlencoded({limit: '100mb', extended: true}));

function randomIntFromInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function generateRandomCode() {
  var CHARS = 10;
  var cod = "";

  for (var q = 0; q < CHARS + 1; q++) {
    if (q == CHARS / 2) {
      cod += "-";
      continue;
    }
    if (Math.random() > 0.5) {
      cod += String.fromCharCode(randomIntFromInterval(65, 90));
    } else {
      cod += String.fromCharCode(randomIntFromInterval(48, 57));
    }
  }

  return cod;
}

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/generate/:quantity/:name/:limit', async (req, res) => {

  try {
    let codeGenerated = 0;
    const limit = parseInt(req.params.limit);
    while (codeGenerated < req.params.quantity) {
      const newcode = generateRandomCode();
      const entry = await cc.findOne({code: newcode});
      if (entry === null) {
        const codeentry = {
          code: newcode,
          downloaded: false,
          used_count: 0,
          use_case: req.params.name,
          use_limit: limit,
          date_downloaded: -1,
          date_used: -1
        };
        await cc.create(codeentry);
        codeGenerated++;
      }
    }
    res.send('Codes Generated: ' + codeGenerated);
  } catch (e) {
    res.send('Result: error');
  }
});

app.get('/reset', async (req, res) => {
  try {
    const entry = await cc.updateMany({}, {
      $set: {
        "downloaded": false,
        "used_count": 0,
        "date_downloaded": -1,
        "date_used": -1
      }
    });
    res.send('All codes reset');
  } catch (e) {
    res.send(`'Sorry GamerSan something went wrong and it's all your fault`);
  }
});

async function ctoArray(cursor) {
  return cursor.toArray();
}

const downloadCodes = async (name, quantity, res) => {
  const tn = Date.now();
  let updatedIndex = 0;
  let codes = "";

  const ret = await cc.find({
    // 'code': {'$regex': /([^O0o]|-){11}/, '$options': 'i'},
    "downloaded": false,
    "use_case": name,
  }).limit(quantity);

  if (ret === null || ret.length < quantity) {
    console.log( "Ret value:", ret, " for name ", name );
    res.send('Not enough codes available for download');
    return;
  }
  for (const elemO of ret) {
    const elem = elemO.toObject();
    updatedIndex++;
    await cc.findOneAndUpdate(
      {"_id": elem._id},
      {"downloaded": true, "date_downloaded": tn}
    );
    codes += elem.code + "\n";
  }

  if (updatedIndex === quantity) {
    const filename = name + '_promocodes.txt';
    fs.writeFile(filename, codes, function (err) {
      if (err) {
        res.send('Something when wrong');
      } else {
        res.download(filename, filename);
        // res.send('Downloaded ' + quantity  + ' codes ' + ' for ' + name);
      }
    })
  }

}

app.get('/download/:name/:quantity', async (req, res) => {
  // var cursor = cc.findAndModify( { query : { "downloaded" : false },
  //                                                      update: { $set : { "downloaded" : true, "use_case" : req.params.name, "date_downloaded" : tn } } }
  //                                                  ).limit(parseInt(req.params.quantity));
  if (isNaN(req.params.quantity)) {
    res.send('GamerSan that is and invalid number');
    return;
  }

  const name = req.params.name;
  const quantity = parseInt(req.params.quantity);
  await downloadCodes(name, quantity, res);
});

app.get('/register_used/:code/', async (req, res) => {
  const tn = Date.now();
  const code = req.params.code;
  let result = "error";
  try {
    const codeO = await cc.findOne({"downloaded": true, "code": code });
    if ( codeO ) {
      const codeDoc = codeO.toObject();
      const doc = await cc.findOneAndUpdate(
        {"downloaded": true, "code": code, "used_count": {$lt: codeDoc.use_limit }},
        { $inc: { used_count: 1 }, "date_used" : tn }
      );
      result = (doc === null) ? "error" : "ok";
    }
    res.send({"result": result});
  } catch (e) {
    console.log(e);
    res.send({"register_used": false, "cause": e });
  }

});

app.get('/list/:use_case', async (req, res) => {
  try {
    const use_case = req.params.use_case;
    const doc = await cc.count({"use_case": use_case});
    if (doc == null) {
      res.send({"result": "error"});
    } else {
      res.send({"total": doc});
    }
  } catch (e) {
    res.send({"result": "error"});
  }
});

app.get('/list/used/:use_case', async (req, res) => {
  try {
    const use_case = req.params.use_case;
    const doc = await cc.count({"use_case": use_case, "used_count":  {$gt: 0 }});
    if (doc == null) {
      res.send({"total": 0});
    } else {
      res.send({"total": doc});
    }
  } catch (e) {
    res.send({"result": "error"});
  }
});

app.get('/overview', async (req, res) => {
  let ret = {};

  try {
    const doc = await cc.distinct("use_case");
    let countDone = 0;
    for (let t = 0; t < doc.length; t++) {
      const doc2 = await cc.count({"use_case": doc[t]});
      ret[doc[t]] = doc2;
      ++countDone;
      if (countDone == doc.length) {
        res.send(ret);
        return;
      }
    }
    res.send("Nothing found yet");
  } catch (e) {
    res.send(e);
  }

});

app.get('/query/:code/', async (req, res) => {
  try {
    const code = req.params.code;
    const docO = await cc.findOne({"code": code});
    if (docO == null) {
      res.send({"result": "Code doesn't exist/invalid"});
    } else {
      const doc = docO.toObject();
      ddt = new Date(doc.date_downloaded);
      ddu = new Date(doc.date_used);
      const dd = (doc.date_downloaded != -1) ? ddt.toUTCString() : "Never";
      const du = (doc.date_used != -1) ? ddu.toUTCString() : "Never";
      const out = {"code": doc.code, "use case": doc.use_case, "downloaded/printed": dd, "used on": du, "number of uses": doc.used_count, "max allowed" : doc.use_limit };
      res.send(JSON.stringify(out));
    }
  } catch (e) {
    res.send({"result": "Code doesn't exist/invalid"});
  }
});

app.get('/used/:code/', async (req, res) => {
  try {
    const code = req.params.code;
    const doc = await cc.findOne({"downloaded": true, "code": code, "used_count": { $gt: 0 } });
    let result = (doc == null ) ? "error" : "ok";
    res.send({"result": result});
  } catch (e) {
    res.send({"result": "error", "cause": e });
  }
});

app.get('/version', function (req, res) {
  res.send({"version": version});
});

const connectToDB = async () => {
  try {
    console.log(mongoDBUrl);
    await mongoose.connect(mongoDBUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("MongoDB connected");
  } catch (err) {
    console.log(err);
  }
}

var port = process.env.PORT || 3003;
http.listen(port, async () => {
  console.log('listening on *:' + port);
  await connectToDB();
});
