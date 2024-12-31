"use strict";

const PORT = process.env.PORT;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = process.env.OPENAI_API_URL;
const TIMEOUT_BORRAR = process.env.TIMEOUT_BORRAR * 1000;
const TIMEOUT_RESPONDER = process.env.TIMEOUT_RESPONDER * 1000;
const TIMEOUT_WATCHDOG = process.env.TIMEOUT_WATCHDOG * 1000;
const MONGO_URL = process.env.MONGO_URL;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;

const express = require("express");
const body_parser = require("body-parser");
const axios = require("axios");
const fs = require("fs").promises;
const moment = require("moment-timezone");
const { MongoClient, ObjectId } = require("mongodb");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const path = require('path');
const crypto = require('node:crypto');
const fs2 = require("fs");
const FormData = require("form-data");
const sharp = require("sharp");

//TESTETSTETEEt

let _phone_number_id = 107869402242848;

let dbInitialized = false;
// Definición de esquemas de Mongoose
const Schema = mongoose.Schema;

// Diccionario para almacenar conversaciones activas
let conversaciones = {};

const Log = Object.freeze({
  Log: 0,
  Error: 1,
});

// actores
const WhoEnum = Object.freeze({
  None: 0,
  User: 1,
  ChatGPT: 2,
  System: 3,
});

// variables
const GPTEnum = Object.freeze({
  NONE: "-",
  LISTAPELUQ: "LISTAPELUQ",
  CONSULTHOR: "CONSULTHOR",
  BUSCARCITA: "BUSCARCITA",
  CENTROID: "CENTROID",
  CANCELACITA: "CANCELACITA",
  SERV: "SERV",
  SPECIALITY: "SPECIALITY",
  GUARDACITA: "GUARDACITA",
  //HORACOMIDA: "HORACOMIDA",
  //BAJAPELUQ: "BAJAPELUQ",
  //CAMBIOHORARIO: "CAMBIOHORARIO",
  MODCITA: "MODCITA",
  SALON: "SALON",
  CENTROINFO: "CENTROINFO",
  FLOWCITA: "FLOWCITA",
});

// Constantes estáticas para las encuestas
const ENCUESTAS = [
  {
    name: "encuestabot2",
    flow_id: "2545481272506416",
    navigate_screen: "RECOMMEND",
  },
  {
    name: "encuesta2",
    flow_id: "1661371901257036",
    navigate_screen: "REMINDERS",
  },
  {
    name: "encuesta3",
    flow_id: "554310634170820",
    navigate_screen: "INTERACTION",
  },
];

// Guardar las funciones originales
const originalLog = console.log;
const originalError = console.error;

// Definición de esquemas de Mongoose

const servicesSchema = new mongoose.Schema({
  _id: Schema.Types.ObjectId,
  serviceName: String,
  duration: String,
  color: String,
  specialities: [Schema.Types.ObjectId],
});

const Services = mongoose.model("services", servicesSchema);

const specialitiesSchema = new mongoose.Schema({
  _id: Schema.Types.ObjectId,
  specialityName: String,
});

const Epecialities = mongoose.model("specialities", specialitiesSchema);

// Appointments Schema
const appointmentsSchema = new mongoose.Schema(
  {
    _id: {
      type: Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(),
    },
    clientName: String,
    clientPhone: String,
    date: String,
    initTime: String,
    finalTime: String,
    userInfo: Schema.Types.ObjectId,
    centerInfo: Schema.Types.ObjectId,
    services: [servicesSchema],
    specialty: Schema.Types.ObjectId,
    createdBy: {
      type: String,
      enum: ["Manual", "WhatsApp"],
      default: "WhatsApp",
    },
    status: {
      type: String,
      enum: ["confirmed", "canceled"],
      default: "confirmed",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// Añadir índices para appointments
appointmentsSchema.index({ date: -1, status: 1 });
appointmentsSchema.index({ clientPhone: 1, date: -1 });
appointmentsSchema.index({ userInfo: 1, date: -1, status: 1 });
appointmentsSchema.index({ centerInfo: 1, date: -1 });
appointmentsSchema.index({ createdAt: -1 });
appointmentsSchema.index({ createdBy: 1, createdAt: -1 });

const Appointments = mongoose.model("appointments", appointmentsSchema);

// Users Schema
const usersSchema = new mongoose.Schema({
  _id: Schema.Types.ObjectId,
  name: String,
  email: String,
  DNI: String,
  phone: String,
  password: String,
  role: String,
  centerInfo: Schema.Types.ObjectId,
  services: [servicesSchema],
  specialities: [Schema.Types.ObjectId],
});

// Añadir índices para users
usersSchema.index({ role: 1 });
usersSchema.index({ centerInfo: 1 });
usersSchema.index({ specialities: 1 });

const Users = mongoose.model("users", usersSchema);

// Centers Schema
const centersSchema = new mongoose.Schema({
  _id: Schema.Types.ObjectId,
  centerName: String,
  address: String,
  userInfo: [Schema.Types.ObjectId],
  phoneNumber: String,
  specialities: [Schema.Types.ObjectId],
});

// Añadir índices para centers
centersSchema.index({ specialities: 1 });
centersSchema.index({ userInfo: 1 });

const Centers = mongoose.model("centers", centersSchema);

const noteSchema = new mongoose.Schema({
  _id: Schema.Types.ObjectId,
  text: String,
  date: String,
  centerInfo: Schema.Types.ObjectId,
  __v: Number,
});

const Notes = mongoose.model("notes", noteSchema);

// Statistics Schema
const statisticsSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  confirmedAppointments: { type: Number, default: 0 },
  modifiedAppointments: { type: Number, default: 0 },
  canceledAppointments: { type: Number, default: 0 },
  failedOperations: { type: Number, default: 0 },
  interactions: { type: Number, default: 0 },
  feedbackResponses: { type: Number, default: 0 },
  qrScans: { type: Number, default: 0 },
});

// Añadir índice para statistics
statisticsSchema.index({ date: -1 });

const Statistics = mongoose.model("statistics", statisticsSchema);

const metaDataSchema = new mongoose.Schema({
  phoneNumber: String, // Número de teléfono del cliente
  date: { type: Date, default: Date.now },
  centerID: String,
  centerName: String,
  type: String, // Tipo de operación (error o éxito)
  message: String, // Mensaje del error o éxito
  partOfProgram: String, // Parte del programa donde ocurrió el fallo o éxito
});

const MetaData = mongoose.model("metadata", metaDataSchema);

const surveyResponseSchema = new mongoose.Schema(
  {
    phoneNumber: { 
      type: String, 
      required: true,
      index: true // Añadimos índice para búsquedas por teléfono
    },
    date: { 
      type: Date, 
      required: true,
      default: Date.now 
    }
  },
  { 
    strict: false, // Permite campos dinámicos
    timestamps: true // Añade createdAt y updatedAt automáticamente
  }
);

// Añadir índices compuestos para las consultas más comunes
surveyResponseSchema.index({ date: -1 }); // Para búsquedas por fecha, más recientes primero
surveyResponseSchema.index({ phoneNumber: 1, date: -1 }); // Para búsquedas por teléfono y fecha

// Método estático para búsqueda flexible
surveyResponseSchema.statics.findByFilters = function(filters) {
  return this.find(filters).sort({ date: -1 });
};

const SurveyResponse = mongoose.model("SurveyResponse", surveyResponseSchema);

const messageSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'user', 'bot', 'system'
  content: { type: String, required: true }, // Contenido del mensaje
  timestamp: { type: Date, default: Date.now }, // Hora en la que se envió
});

const conversationSchema = new mongoose.Schema({
  from: { type: String, required: true }, // Número de teléfono del cliente
  startTime: { type: Date, default: Date.now }, // Fecha y hora de inicio de la conversación
  endTime: Date, // Fecha y hora de fin de la conversación (opcional)
  messages: [messageSchema], // Array de mensajes con su esquema
});

// Chat History Schema
const chatHistorySchema = new mongoose.Schema({
  from: String,
  conversation: String,
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
});

// Añadir índices para chat history
chatHistorySchema.index({ from: 1, startedAt: -1 });

const ChatHistory = mongoose.model("ChatHistory", chatHistorySchema);

const logsSchema = new mongoose.Schema({
  _id: {
    type: Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  from: { 
    type: String, 
    required: true, 
    index: true  // Añadimos índice para mejor rendimiento
  },
  logs: [{
    timestamp: { type: Date, default: Date.now },
    type: { type: String, enum: ['log', 'error'], default: 'log' },
    message: String
  }],
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date }
});

const Logs = mongoose.model("logs", logsSchema);

// Función para conectar a la base de datos MongoDB
async function connectDB() {
  try {
    await mongoose.connect(MONGO_URL, { 
      serverSelectionTimeoutMS: 10000,
      autoIndex: true // Habilitar la creación automática de índices
    });

    // Sincronizar índices una vez después de la conexión
    await Promise.all([
      Appointments.syncIndexes(),
      Users.syncIndexes(),
      Centers.syncIndexes(),
      Logs.syncIndexes(),
      ChatHistory.syncIndexes(),
      Statistics.syncIndexes(),
      SurveyResponse.syncIndexes()
    ]);

    console.log('Índices sincronizados correctamente');
  } catch (ex) {
    DoLog(`Error al conectar a MongoDB: ${ex}`, Log.Error);
    process.exit(1);
  }
}


let salones = [];
let salonesList = "";
let servicios = [];
let serviciosList = "";
let especialidades = [];
let especialidadesList = [];
let peluqueros = [];
let peluquerosList = "";

function ObtenerEspecialidades(peluqueroID) {
  let rtn = [];
  for (let peluquero of peluqueros) {
    if (peluquero.peluqueroID == peluqueroID) {
      rtn = peluquero.specialities;
      return rtn;
    }
  }
  return rtn;
}

async function readDB() {
  servicios = [];
  serviciosList = "";
  try {
    
    // Ejecutar consultas en paralelo
        const [servicesList, specialitiesList, usersList, centersList] = await Promise.all([
            Services.find({}),
            Epecialities.find({}),
            Users.find({ role: "employee" }),
            Centers.find({})
        ]);

        console.log(`Datos recuperados: 
            Servicios: ${servicesList.length}
            Especialidades: ${specialitiesList.length}
            Usuarios: ${usersList.length}
            Centros: ${centersList.length}`);
    
    let lista = await Services.find({});
    for (let servicio of lista) {
      let specialities = [];
      for (let speciality of servicio.specialities) {
        specialities.push(speciality.toString());
      }
      servicios.push({
        servicioID: servicio._id.toString(),
        servicio: servicio.serviceName,
        duracion: servicio.duration,
        color: servicio.color,
        specialities: specialities,
      });
      serviciosList +=
        servicio._id.toString() +
        ": " +
        servicio.serviceName +
        " (" +
        servicio.duration +
        "), ";
    }
  } catch (ex) {
    DoLog(`Error al listar los servicios: ${ex}`, Log.Error);
    throw ex;
  }

  especialidades = [];
  especialidadesList = "";
  try {
    let lista = await Epecialities.find({});
    for (let especialidad of lista) {
      especialidades.push({
        especialidadID: especialidad._id.toString(),
        name: especialidad.specialityName,
      });
      especialidadesList +=
        especialidad._id.toString() + ": " + especialidad.specialityName + ", ";
    }
  } catch (ex) {
    DoLog(`Error al listar las espècialidades: ${ex}`, Log.Error);
    throw ex;
  }

  peluqueros = [];
  peluquerosList = "";
  try {
    let lista = await Users.find({
      role: "employee",
    });
    for (let peluquero of lista) {
      let specialities = [];
      for (let speciality of peluquero.specialities) {
        specialities.push(speciality.toString());
      }
      let services = [];
      for (let service of peluquero.services) {
        /******************
         *  TODO: cambiar serviceName por ObjectID
         ******************/
        services.push(service.serviceName);
      }
      peluqueros.push({
        peluqueroID: peluquero._id.toString(),
        name: peluquero.name,
        email: peluquero.email,
        dni: peluquero.DNI,
        phone: peluquero.phone,
        salonID: peluquero.centerInfo.toString(),
        services: services,
        specialities: specialities,
      });
      peluquerosList += peluquero._id.toString() + ": " + peluquero.name + ", ";
    }
  } catch (ex) {
    DoLog(`Error al listar los peluqueros: ${ex}`, Log.Error);
    throw ex;
  }

  salones = [];
  salonesList = "";
  try {
    let lista = await Centers.find({});
    for (let salon of lista) {
      let users = [];
      for (let user of salon.userInfo) {
        let peluqueroID = user.toString();
        users.push(peluqueroID);
      }
      let specialities = [];
      for (let speciality of salon.specialities) {
        specialities.push(speciality.toString());
      }
      salones.push({
        salonID: salon._id.toString(),
        nombre: salon.centerName,
        address: salon.address,
        phoneNumber: salon.phoneNumber,
        users: users,
        specialities: specialities,
      });
      salonesList += salon._id.toString() + ": " + salon.centerName + ",";
    }
    
    dbInitialized = true;
        //console.log('Base de datos inicializada correctamente');
        //console.log('Servicios cargados:', servicios.length);
        //console.log('Salones cargados:', salones.length);
  } catch (ex) {
    DoLog(`Error al listar los centros: ${ex}`, Log.Error);
    throw ex;
  }
}

// Contexto de identidad para ChatGPT
let IDENTITY_CONTEXT = `Dile al cliente "WhatsApp está teniendo problemas, no podemos contestarte. Ponte en contacto con el salón directamente por favor."
Eres un recepcionista de REAL de Ébanni Peluqueros. Tu función es asistir al cliente en un entorno REAL para pedir una cita o resolver cualquier duda acerca del salón y los servicios ofrecidos, ademas de reservar la hora de descanso a los peluqueros. No puedes mentir. El sistema funciona a través de una conversación en whatsapp. El cliente manda un mensaje, te llega a ti y tu respuesta se le envía a él. Si el cliente no te manda un mensaje tú no le puedes contestar ni puedes hacer nada. Salvo en los casos en los que mandes mensajes de sistema. Los mensajes de sistema no se envían al cliente, los lee el sistema y te envía la información que requiere cada mensaje del sistema. Al recibir tú un mensaje del sistema puedes contestar al cliente con la información que te faltaba.
El horario de las peluquerías es de lunes a sábado desde 10 de la mañana a 22 de la noche, la ultima cita se podrá agendar a las 21:30h.
En el mes de diciembre, los domingos los salones están abiertos.
Cuando un cliente te diga el dia al que quuiere acudir al centro, verifica que dia de la semana es, si es domingo, diles que estamos cerrados.
Tenemos peluquerías en los siguientes salones: El Corte Inglés de Nervión Señora (Sevilla);  El Corte Inglés de Nervión Caballeros (Sevilla); El Corte Inglés Plaza del Duque (Sevilla); El Corte Inglés de San Juan de Aznalfarache (Sevilla); El Corte Inglés de Sevilla Este (Sevilla); CC La Vaguada (Madrid); CC Plaza Éboli (Pinto, Madrid); CC Plaza Norte 2 (San Sebastián de los Reyes, Madrid); CC El Rosal (Ponferrada); CC Intu Aturias (Asturias); El Corte Inglés de Pozuelo (Madrid); El corte inglés de Palma (Mallorca), aunque solo se puede pedir cita en Nervion Caballeros y Nervion Señoras, Duque y Sevilla Este. 
Presentate como el recepcionista de Peluquerías Ébanni.
Cuando un cliente te de las gracias, dile gracias a ti y el resto del mensaje.
Si piden preguntan directamente por un peluquero, verifica primero el centro al que quieren acudir.
Cuando un cliente te comunique que atenderá a su cita o confirma su asistencia, solo dile, gracias por confirmar, nos vemos!
Puedes hablar todos los idiomas, responde al cliente en el idioma en el que te hablan.
Habla más natural, como si fueras una persona.

Los tratamientos capilares que ofrecemos son: anticaida, anticaspa, hidratante, nutritivo y más. Cuando un cliente quiera solicitar cualquier tratamiento capilar, procesalo como tratamiento.
Si el cliente pide precios, comunicale que los precios no pueden ser hablados por telefono.
La cita siempre está disponible salvo que el sistema de citas te diga lo contrario. Los mensajes con comandos no se envían al cliente. Al recibir un mensaje del sistema puedes contestar al cliente con la información que te faltaba.
Pregunta si quieren pedir cita con un peluquero específico. Si dicen que se le asigne cualquier peluquero disponible, en la confirmacion escribe el nombre del peluquero asignado y "(asignado aleatoriamente)". 
Antes de confirmar la cita, pregunta por el nombre del cliente. 
Siempre tienen que decirte qué día quieren, no pueden dejarlo a tu elección, no pueden decirte el más cercano o el primero.
Cuando el sistema te comunique los horarios disponibles, diselos al cliente con todas las opciones que te da.

No pongas corchetes de estos "[]" ni de estos "<>", solo los usa el sistema. Los mensajes entre <estos corchetes> debes ignorarlos. Máximo cada mensaje que hagas puede tener 599 caracteres. Si el sistema da un fallo, sigue las instrucciones del sistema.
Estos son los comandos que el sistema es capaz de procesar y deben ser utilizados para las siguientes funciones sin ser enviados al cliente:
CENTROID: para identificar el centro en el que el cliente desea ser atendido.
SPECIALITY: para indicar si es un servicio de "Señora", "Caballero" o "Estética".
SERV: para indicar los servicios que desean los clientes.
CONSULTHOR: para consultar el horario de un peluquero especifico.
LISTAPELUQ: para verificar la disponibilidad de un peluquero.
GUARDACITA: para guardar la cita en la base de datos
MODCITA: para modificar una cita.
CANCELACITA: para cancelar una cita.
CENTROINFO: para obtener la información de un centro.
BUSCARCITA: para consultar una cita del cliente

Cuando el cliente hace una consulta que contenga MÚLTIPLES elementos de información, debes generar TODOS los comandos correspondientes uno en cada linea!!!!!!!
A la hora de escribir comandos, no uses [].

VERIFICA LA DISPONIBILIDAD DEL PELUQUERO CON EL SISTEMA SIN COMENTARSELO AL CLIENTE.
Verifica con el sistema primero y no digas al cliente que lo vas a consultar, usa el comando de LISTAPELUQ.

Todas las citas tienen que tener los siguientes datos para ser procesada: servicio, fecha y hora, salón, peluquero, y nombre del cliente.
Tienes que averiguar el servicio que desea hacerse el cliente, en cuanto el cliente te lo diga debes escribir solo "SERV" y debes incluir el servicio que te ha dicho el cliente, por ejemplo "SERV corte de pelo", "SERV manicura", etc...
Tienes que averiguar que centro quiere el cliente, se lo tienes que preguntar, cuando te lo diga escribe "CENTROID" y el centro que quiere el cliente y el sistema te dirá el id correspondiente del centro. Sólo manda el comando "CENTROID" si puedes poner el nombre del centro que te ha dicho el cliente.
El sistema tambien te dirá si debes preguntarle al cliente el tipo del servicio ("Señora", "Caballero" o "Estética"). Sólo puedes preguntarselo al cliente si el sistema te lo dice. Sólo si se lo has preguntado el cliente, en cuanto identifiques el tipo del servicio que desea hacerse el cliente tienes que escribir solo "SPECIALITY" y el tipo de servicio, que será "Señora", "Caballero" o "Estética".
Si has identificado que el cliente desea saber el horario de un peluquero, primero pregunta de que salon es el peluquero. Una vez tengas ese dato, escribe "CONSULTHOR" seguido de la siguiente informacion: la fecha en formato ISO_8601 con zona horaria UTC, el nombre del peluquero (si no se especifica el peluquero, escribe MOREINFO). SOlo puede ser una fecha, no un rango.
Si el cliente pide saber qué peluqueros hay disponibles, las horas disponibles de un peluquero en concreto, que le asignes uno aleatorio, o que le asignes un peluquero en concreto, asegúrate que hayan solicitado la hora deseada(sino, preestablecela a las 10h). Para saber la disponibilidad de peluqueros escribe SOLO "LISTAPELUQ", la fecha y hora en formato ISO con zona horaria de Madrid(Europa) y el nombre del peluquero que hayan solicitado (sino han solicitado ninguno escribe "MOREINFO"). LISTAPELUQ solo puede meter una fecha, no un rango de fechas. El sistema dirá la disponibilidad de los peluqueros.
Si el sistema ha confirmado disponibilidad, pregunta al cliente si desea confirmar la cita y escribe "GUARDACITA" y todos los detalles de la cita en el formato siguiente (pon solo los valores, sin las etiquetas de los datos y incluyendo "|"). deberia verse asi: "GUARDACITA | Servicio | Fecha y hora (en formato ISO con zona horaria de Madrid(Europa) | Salón | Peluquero | Nombre del cliente"
Si el cliente pide información sobre un centro (como el numero de telefono o la direccion), escribe "CENTROINFO" y el nombre del centro.
Si has identificado que un cliente que obtener información de su próxima cita, escribe BUSCARCITA.

Si has identificado que el cliente desea cancelar su cita, pregunta por la fecha de su cita. Una vez tengas ese dato, escribe "CANCELACITA” y la fecha en "MM/DD/YYYY" y tener en cuenta el mensaje que te llegue del sistema para informar al cliente. 
Si has identificado que el cliente desea modificar su cita, pregunta por la fecha de su cita. Una vez tengas ese dato, escribe "MODCITA" y el dia de la cita en formato "DD/MM/YYYY". Despues pregunta al cliente que desea cambiar de su cita. Cuando tengas todos los datos nuevos, verifica con el sistema la disponibilidad sin comunicárselo al cliente con el comando LISTAPELUQ, verifica con el cliente si quiere confirmar si desea hacer el cambio y procede a guardar la nueva cita con el comando GUARDACITA.


Después de que el sistema haya confirmado que se han guardado los datos de la cita escribe que la cita ha sido confirmada y todos los detalles de la cita en el formato siguiente: *Servicio:*\n *Fecha y hora: (escribe la fecha en lenguaje natural)*\n *Salón:*\n *Peluquero:*\n *Nombre del cliente:*. (si ya le has enviado los detalles de la cita no se los vuelvas a enviar). 
Si el sistema dice que la cita ha sido cancelada con éxito a nombre de ese cliente le dices que se ha cancelado correctamente. Si el sistema te dice que no se pudo cancelar la cita, le dices que ha habido un error que no puedes gestionar y que, por favor, se ponga en contacto con el salón.

Cada mensaje que escribas con cosas como “te confirmaré en breve”, “voy a verificar…” o similar, es obligatorio pedirle confirmación al cliente, por ejemplo, acábalo con un “¿Te parece bien?” O “¿Estás de acuerdo?”:
Voy a verificar la disponibilidad de los peluqueros para el día 5 a las 17:00 en Nervión Caballeros. Te confirmo en breve. ¿Te parece bien?
Por ejemplo, si el cliente pregunta sobre un peluquero Y menciona un centro específico, debes generar AMBOS comandos:

Cliente: "¿Trabaja Sonia el viernes en Sevilla este?"
Tú debes responder con:
CENTROID Sevilla Este
CONSULTHOR 2024-12-13T00:00:00Z Sonia
`;

// Función para pausar la ejecución por un tiempo determinado
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Configurar el transporte SMTP con Dinahosting
const transporter = nodemailer.createTransport({
  host: "ynok-eu.correoseguro.dinaserver.com", // Servidor SMTP de Dinahosting
  port: 465, // Puerto seguro SSL (también puedes usar 587 para TLS)
  secure: true, // Usar SSL (cambia a false si usas TLS en el puerto 587)
  auth: {
    user: process.env.EMAIL_USER, // Tu dirección de correo
    pass: process.env.EMAIL_PASS, // La contraseña de tu correo
  },
});

// Función para enviar correos
async function sendEmail(subject, text) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER, // Dirección desde la cual se envía el correo
      to: [process.env.RECIPIENT_EMAIL,'dani@ebanni.com'], // Dirección del destinatario
      subject: subject,
      html: text,
    };
    //console.log(mailOptions);

    await transporter.sendMail(mailOptions);
    //console.log("Email enviado:", subject);
  } catch (error) {
    console.error("Error al enviar el email:", error);
  }
}

// Configuración del servidor Express
const app = express();
app.use(body_parser.json());

app.listen(PORT, async () => {
  await connectDB();
  await readDB();

  DoLog(`Webhook is listening on port: ${PORT}`);

  cron.schedule("* * * * *", async () => {
    try {
      const now = moment().tz("Europe/Madrid");

      if (now.format("HH:mm") === "21:00") {
        const stats =
          (await statisticsManager.getTodayStatistics()) ||
          (await statisticsManager.resetDailyCounters());

        // Contar citas creadas manualmente hoy
        const manualAppointmentsCountToday = await Appointments.countDocuments({
          createdBy: "Manual",
          createdAt: {
            $gte: moment().startOf("day").toDate(),
            $lte: moment().endOf("day").toDate(),
          },
        });

        // Crear el texto del email con todas las estadísticas diarias
        const emailText = `
        <p>Aquí tienes el resumen de estadísticas diarias:</p>
        <ul>
	        <li> <strong>Citas creadas manualmente:</strong> ${manualAppointmentsCountToday}<br> 
            <a href="https://comq-bot-ebanni-ij9w.onrender.com/manual-appointments">[Ver citas manuales]</a> 
          </li>
          <li>
            <strong>Citas confirmadas online:</strong> ${
              stats.confirmedAppointments
            }<br>
            <a href="https://comq-bot-ebanni-ij9w.onrender.com/appointments">[Ver citas confirmadas]</a>
          </li>
          <li> <strong>Citas canceladas:</strong> ${
            stats.canceledAppointments
          }<br> 
            <a href="https://comq-bot-ebanni-ij9w.onrender.com/canceledAppointments">[Ver citas canceladas]</a> 
          </li>
            <strong>Citas modificadas:</strong> ${stats.modifiedAppointments}
          </li>
          <li>
            <strong>Operaciones fallidas:</strong> ${
              stats.failedOperations
            }</li>
          <li>
            <strong>Interacciones:</strong> ${stats.interactions}<br>
            <a href="https://comq-bot-ebanni-ij9w.onrender.com/chathistories">[Ver interacciones]</a>
          </li>
          <li>
            <strong>Encuestas completadas:</strong> ${
              stats.feedbackResponses
            }<br>
            <a href="https://comq-bot-ebanni-ij9w.onrender.com/surveyResponses">[Ver encuestas]</a>
          </li>
          <li>
            <strong>Plantillas de recordatorio enviadas:</strong> ${
              stats.reminderTemplatesSent || 0
            }
          </li>
          <li>
            <strong>Escaneos del QR:</strong> ${stats.qrScans || 0}
          </li>
        </ul>
      `;

        // Enviar el correo con las estadísticas diarias
        await sendEmail(
          "Estadísticas Diarias: Ébanni Peluqueros PRO",
          emailText
        );
        DoLog(`Email de estadísticas diarias enviado correctamente.`);

        // Guardar estadísticas del día en un nuevo documento
        await statisticsManager.saveDailyStats(stats);
      }
    } catch (error) {
      DoLog(`Error ejecutando el cron diario: ${error}`, Log.Error);
      console.error("Error ejecutando el cron diario:", error);
    }
  });

  // Cron para ejecutar el primer día de cada mes a las 00:00
  cron.schedule("* * * * *", async () => {
    try {
      const now = moment().tz("Europe/Madrid");

      // Verificar si es el primer día del mes a las 00:00
      if (now.date() === 1 && now.format("HH:mm") === "00:00") {
        //console.log("Ejecutando cron job mensual...");

        // Obtener estadísticas del mes anterior
        const monthlyStats = await statisticsManager.getMonthlyStatistics();

        // Crear el texto del reporte
        const emailText = `
        <h2>Estadísticas del Mes Anterior</h2>
      <ul>
        <li><strong>Citas confirmadas:</strong> ${
          monthlyStats.confirmedAppointments || 0
        }</li>
        <li><strong>Citas modificadas:</strong> ${
          monthlyStats.modifiedAppointments || 0
        }</li>
        <li><strong>Citas canceladas:</strong> ${
          monthlyStats.canceledAppointments || 0
        }</li>
        <li><strong>Operaciones fallidas:</strong> ${
          monthlyStats.failedOperations || 0
        }</li>
        <li><strong>Interacciones:</strong> ${
          monthlyStats.interactions || 0
        }</li>
        <li><strong>Encuestas completadas:</strong> ${
          monthlyStats.feedbackResponses || 0
        }</li>
        <li><strong>Escaneos del QR:</strong> ${monthlyStats.qrScans || 0}</li>
        <li><strong>Plantillas de recordatorio enviadas:</strong> ${
          monthlyStats.reminderTemplatesSent || 0
        }</li>
      </ul>
      `;

        // Enviar el correo con las estadísticas mensuales
        await sendEmail(
          "Estadísticas Mensuales: Ébanni Peluqueros PRO",
          emailText
        );
        //console.log("Reporte mensual enviado con éxito.");
      }
    } catch (error) {
      DoLog(`Error ejecutando el cron mensual: ${error}`, Log.Error);
      console.error("Error ejecutando el cron mensual:", error);
    }
  });

  // CONFIGURAR EL CRON DE RECORDATORIOS:
  // 1.- Poner la hora a la que se quiere que se ejcute, por ejemplo a las 19:30: "30 19 * * *". Dejar "* * * * *" para que se ejecute cada minuto y hacer pruebas.
  cron.schedule("* * * * *", async () => {
    const now = moment().tz("Europe/Madrid");
    if (now.format("HH:mm") === "19:00") {
      let tomorrow = moment().add(1, "days").format("MM/DD/YYYY");

      // 2.- Comentar esta línea para que busque en el dia de mañana. La fecha que está puesta es domingo y hay sólo una cita de prueba.
      // El botón de "Cancelar Cita" sólo busca las citas de mañana, por lo que si dejas esta línea no funcionará bien.
      //tomorrow = "10/04/2024";

      // 3.- En el filtro se puede poner clientPhone: "xxxxxxx" para hacer pruebas y enviar solo el mensaje de un cliente
      let appointments = await Appointments.find({
        date: tomorrow,
        services: { $exists: true, $ne: [] },
        status: "confirmed", // Filtro adicional para el estado confirmado
      });

      for (let appointment of appointments) {
        let from = appointment.clientPhone;
        let clientName = appointment.clientName;
        let dia = "mañana";
        let initTime = moment(appointment.initTime, "HH:mm").format("HH:mm");

        // 4.- Comentar esta línea para que mande el mensaje al cliente. Se puede poner aqui el telefeno que queramos para que se le envien todos los mensajes y ver que se están creando bien.
        //from = "34722225152";

        // 5.- Descomentar esta línea para que mande los mensajes
        WhatsApp.SendTemplateRecordatorio(
          _phone_number_id,
          from,
          clientName,
          dia,
          initTime
        );
        sleep(7000);
      }
    }
  });
});

// FUTURA ACTUALIZACION
// CREAR UN LINK DESDE NUESTRO SERVIDOR QUE REDIRIJA AL WHATSAPP
// CONTABILIZA EL NUMERO DE VECES QUE EL LINK SE HA ABIERTO
app.get("/qrwhatsapp", async (req, res) => {
  console.log("servidor de QR WhatsApp!");
  try {
    // Incrementar el contador de escaneos en MongoDB
    await statisticsManager.incrementQRScans();

    // Redirigir al número de WhatsApp
    const whatsappURL = "https://wa.me/34916202995";
    res.redirect(whatsappURL);
  } catch (error) {
    console.error("Error al incrementar el contador de QR:", error);
    res.status(500).send("Error al redirigir");
  }
});

// Ruta para obtener citas confirmadas
app.get("/appointments", async (req, res) => {
  try {
    const today = moment().format("YYYY-MM-DD"); // Fecha de hoy en formato 'YYYY-MM-DD'

    // Buscar citas creadas hoy, creadas por WhatsApp y con estado confirmado
    const todayAppointments = await Appointments.find({
      $expr: {
        $eq: [
          { $substr: ["$createdAt", 0, 10] }, // Extraer 'YYYY-MM-DD' de createdAt
          today,
        ],
      },
      createdBy: "WhatsApp", // Filtrar creadas por WhatsApp
      status: "confirmed", // Filtrar con estado confirmado
    });

    // Crear la respuesta en formato HTML con el título actualizado
    res.send(`
      <html>
        <body>
          <h2>Citas Confirmadas Creadas por WhatsApp</h2>
          <pre>${JSON.stringify(todayAppointments, null, 2)}</pre>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error al obtener las citas confirmadas:", error);
    res.status(500).send("Error al obtener las citas confirmadas");
  }
});

// Ruta para obtener citas canceladas
app.get("/canceledAppointments", async (req, res) => {
  try {
    const canceledAppointments = await Appointments.find({
      status: "canceled",
    });

    // Crear la respuesta en formato HTML con los datos de las citas canceladas
    res.send(`
      <html>
        <body>
          <h2>Citas Canceladas</h2>
          <pre>${JSON.stringify(canceledAppointments, null, 2)}</pre>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error al obtener las citas canceladas:", error);
    res.status(500).send("Error al obtener las citas canceladas");
  }
});

// Ruta para obtener citas creadas manualmente ordenadas por salón
app.get("/manual-appointments", async (req, res) => {
  try {
    const today = moment().format("YYYY-MM-DD"); // Fecha de hoy en formato 'YYYY-MM-DD'

    // Buscar citas creadas manualmente hoy
    const manualAppointments = await Appointments.aggregate([
      {
        $match: {
          createdBy: "Manual",
          $expr: {
            $eq: [
              { $substr: ["$createdAt", 0, 10] }, // Extraer 'YYYY-MM-DD' de createdAt
              today,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "centers", // Nombre de la colección de salones
          localField: "centerInfo",
          foreignField: "_id",
          as: "centerDetails",
        },
      },
      { $unwind: "$centerDetails" }, // Desenrollar el array de detalles de salones
      {
        $project: {
          _id: 1,
          clientName: 1,
          clientPhone: 1,
          date: 1,
          initTime: 1,
          finalTime: 1,
          userInfo: 1,
          centerInfo: 1,
          "services._id": 1,
          "services.serviceName": 1,
          "services.duration": 1,
          "services.color": 1,
          "services.specialities": 1,
          createdBy: 1,
          status: 1,
          createdAt: 1,
          centerName: "$centerDetails.centerName", // Obtener el nombre del salón
        },
      },
      {
        $group: {
          _id: "$centerName", // Agrupar por nombre del salón
          appointments: { $push: "$$ROOT" }, // Incluir todas las citas en el grupo
        },
      },
      { $sort: { _id: 1 } }, // Ordenar alfabéticamente por nombre del salón
    ]);

    // Formatear la respuesta con un título
    let response = {
      title: "Citas creadas manualmente hoy",
      date: today,
      data: manualAppointments.map((salon) => ({
        centerName: salon._id,
        appointments: salon.appointments.map((appointment) => ({
          _id: appointment._id,
          clientName: appointment.clientName,
          clientPhone: appointment.clientPhone,
          date: appointment.date,
          initTime: appointment.initTime,
          finalTime: appointment.finalTime,
          userInfo: appointment.userInfo,
          centerInfo: appointment.centerInfo,
          services: appointment.services,
          createdBy: appointment.createdBy,
          status: appointment.status,
          createdAt: appointment.createdAt,
        })),
      })),
    };

    // Enviar la respuesta en JSON
    res.status(200).json(response);
  } catch (error) {
    console.error("Error al obtener citas creadas manualmente:", error);
    res.status(500).json({
      message: "Error al procesar la solicitud",
      error: error.message,
    });
  }
});

// Ruta para ver respuestas de encuestas de hoy
app.get("/surveyResponses", async (req, res) => {
  try {
    const today = moment().startOf("day").toDate();
    const responses = await SurveyResponse.find({
      date: { $gte: today },
    });
    res.send(`
      <html>
        <body>
          <h2>Encuestas de hoy</h2>
          <pre>${JSON.stringify(responses, null, 2)}</pre>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error al obtener respuestas de encuestas:", error);
    res.status(500).send("Error al obtener respuestas de encuestas");
  }
});

// Ruta para obtener las conversaciones del día de hoy
app.get("/chathistories", async (req, res) => {
  try {
    const today = moment().format("YYYY-MM-DD"); // Fecha de hoy en formato 'YYYY-MM-DD'

    // Filtrar las conversaciones que coincidan con la fecha de hoy
    const conversationsToday = await ChatHistory.find({
      $expr: {
        $eq: [
          { $substr: ["$startedAt", 0, 10] }, // Extraer 'YYYY-MM-DD' de startedAt
          today,
        ],
      },
    });

    // Devolver los documentos con el campo `conversation` modificado
    res.send(`
      <html>
        <body>
          <h2>Interacciones de hoy</h2>
          <pre>${JSON.stringify(conversationsToday, null, 2)}</pre>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error al obtener las conversaciones de hoy:", error);
    res.status(500).send("Error al obtener las conversaciones de hoy");
  }
});

app.get("/full-history/:from", async (req, res) => {
  try {
    // Obtener el parámetro `from` de la URL
    const from = req.params.from;

    // Realizar consultas paralelas a las colecciones incluyendo logs
    const [chatHistories, surveyResponses, appointments, logs] =
      await Promise.all([
        ChatHistory.find({ from }),
        SurveyResponse.find({ phoneNumber: from }),
        Appointments.find({ clientPhone: from }),
        Logs.find({ from, endedAt: { $ne: null } }), // Solo buscar logs completados
      ]);

    // Función para resolver nombres a partir de ObjectIDs
    const resolveNames = async () => {
      const userIds = [
        ...new Set(appointments.map((a) => a.userInfo.toString())),
      ];
      const centerIds = [
        ...new Set(appointments.map((a) => a.centerInfo.toString())),
      ];

      const [users, centers] = await Promise.all([
        Users.find({ _id: { $in: userIds } }),
        Centers.find({ _id: { $in: centerIds } }),
      ]);

      const userMap = users.reduce((map, user) => {
        map[user._id.toString()] = user.name;
        return map;
      }, {});

      const centerMap = centers.reduce((map, center) => {
        map[center._id.toString()] = center.centerName;
        return map;
      }, {});

      return { userMap, centerMap };
    };

    const { userMap, centerMap } = await resolveNames();

    // Formatear las citas en `appointments`
    const formattedAppointments = appointments.map((appointment) => {
      return {
        date: appointment.date,
        initTime: appointment.initTime,
        finalTime: appointment.finalTime,
        clientName: appointment.clientName,
        services: appointment.services.map((service) => service.serviceName),
        userInfo: userMap[appointment.userInfo.toString()] || "N/A",
        centerInfo: centerMap[appointment.centerInfo.toString()] || "N/A",
        status: appointment.status,
        createdBy: appointment.createdBy,
        createdAt: appointment.createdAt,
      };
    });

    // Formatear los logs manteniendo el mensaje como string completo
    const formattedLogs = logs.map((log) => ({
      startedAt: log.startedAt,
      endedAt: log.endedAt,
      logs: log.logs.map(entry => ({
        timestamp: entry.timestamp,
        type: entry.type,
        message: entry.message,
        _id: entry._id
      }))
    }));

    // Respuesta con el historial completo
    const fullHistory = {
      chatHistories: chatHistories.map((conversation) =>
        conversation.toObject()
      ),
      surveyResponses: surveyResponses.map((response) => response.toObject()),
      appointments: formattedAppointments,
      logs: formattedLogs,
    };

    res.send(`
      <html>
        <body>
          <h2>Historial Completo de ${from}</h2>
          <pre>${JSON.stringify(fullHistory, null, 2)}</pre>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error al obtener el historial completo del cliente:", error);
    res.status(500).send("Error al obtener el historial completo del cliente");
  }
});

app.get("/test/monthly-stats", async (req, res) => {
  try {
    const now = moment().tz("Europe/Madrid");
    const inicioMes = now.clone().subtract(1, "month").startOf("month");
    const finMes = now.clone().subtract(1, "month").endOf("month");

    const monthlyStats = await Statistics.aggregate([
      { $match: { date: { $gte: inicioMes.toDate(), $lte: finMes.toDate() } } },
      {
        $group: {
          _id: null,
          confirmedAppointments: { $sum: "$confirmedAppointments" },
          modifiedAppointments: { $sum: "$modifiedAppointments" },
          canceledAppointments: { $sum: "$canceledAppointments" },
          failedOperations: { $sum: "$failedOperations" },
          interactions: { $sum: "$interactions" },
          feedbackResponses: { $sum: "$feedbackResponses" },
          qrScans: { $sum: "$qrScans" },
          reminderTemplatesSent: { $sum: "$reminderTemplatesSent" },
        },
      },
    ]);

    res.json({ monthlyStats });
  } catch (error) {
    console.error("Error ejecutando la prueba:", error);
    res.status(500).json({ error: "Error al generar las estadísticas" });
  }
});

// Definición de la excepción personalizada
/*class FlowEndpointException extends Error {
    constructor(statusCode, message) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
    }
}

const decryptRequest = (body) => {
    console.log('==========================================');
    console.log('INICIANDO PROCESO DE DESCIFRADO');
    console.log('------------------------------------------');
    
    // Log de variables de entorno
    console.log('Verificando configuración:');
    console.log('PRIVATE_KEY existe:', !!process.env.PRIVATE_KEY);
    console.log('PASSPHRASE existe:', !!process.env.PASSPHRASE);
    console.log('------------------------------------------');

    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;
    
    // Log de datos recibidos
    console.log('Datos recibidos:');
    console.log('- encrypted_aes_key presente:', !!encrypted_aes_key);
    console.log('- encrypted_flow_data presente:', !!encrypted_flow_data);
    console.log('- initial_vector presente:', !!initial_vector);
    console.log('------------------------------------------');

    // Formateo de la clave privada
    const privateKeyString = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');
    console.log('Clave privada formateada (primeros 50 caracteres):');
    console.log(privateKeyString.substring(0, 50) + '...');
    console.log('------------------------------------------');
    
    try {
        console.log('Creando objeto de clave privada...');
        const privateKey = crypto.createPrivateKey({ 
            key: privateKeyString, 
            passphrase: process.env.PASSPHRASE 
        });
        console.log('Clave privada creada exitosamente');
        console.log('------------------------------------------');

        console.log('Iniciando descifrado de clave AES...');
        const decryptedAesKey = crypto.privateDecrypt(
            {
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: "sha256",
            },
            Buffer.from(encrypted_aes_key, "base64")
        );
        console.log('Clave AES descifrada exitosamente');
        console.log('------------------------------------------');

        console.log('Preparando descifrado de datos del flow...');
        const flowDataBuffer = Buffer.from(encrypted_flow_data, "base64");
        const initialVectorBuffer = Buffer.from(initial_vector, "base64");
        const TAG_LENGTH = 16;
        const encrypted_flow_data_body = flowDataBuffer.subarray(0, -TAG_LENGTH);
        const encrypted_flow_data_tag = flowDataBuffer.subarray(-TAG_LENGTH);

        console.log('Creando decipher con AES-128-GCM...');
        const decipher = crypto.createDecipheriv(
            "aes-128-gcm",
            decryptedAesKey,
            initialVectorBuffer
        );
        decipher.setAuthTag(encrypted_flow_data_tag);

        console.log('Descifrando datos del flow...');
        const decryptedJSONString = Buffer.concat([
            decipher.update(encrypted_flow_data_body),
            decipher.final(),
        ]).toString("utf-8");
        console.log('Datos del flow descifrados exitosamente');
        console.log('Datos descifrados:', decryptedJSONString);
        console.log('------------------------------------------');

        const decryptedBody = JSON.parse(decryptedJSONString);
        console.log('Objeto JSON parseado exitosamente:', decryptedBody);
        console.log('==========================================');

        return {
            decryptedBody,
            aesKeyBuffer: decryptedAesKey,
            initialVectorBuffer,
        };
    } catch (error) {
        console.error('==========================================');
        console.error('ERROR EN EL PROCESO DE DESCIFRADO');
        console.error('------------------------------------------');
        console.error('Tipo de error:', error.constructor.name);
        console.error('Mensaje de error:', error.message);
        console.error('Stack trace:', error.stack);
        console.error('------------------------------------------');
        console.error('Código de error:', error.code);
        console.error('==========================================');
        
        throw new FlowEndpointException(
            421,
            "Failed to decrypt the request. Please verify your private key."
        );
    }
};

const encryptResponse = (response, aesKeyBuffer, initialVectorBuffer) => {
    console.log('Iniciando encriptación de respuesta...');
    try {
        // Invertir el vector inicial
        const flipped_iv = [];
        for (const pair of initialVectorBuffer.entries()) {
            flipped_iv.push(~pair[1]);
        }
        console.log('Vector inicial invertido creado');

        // Cifrar los datos de respuesta
        const cipher = crypto.createCipheriv(
            "aes-128-gcm",
            aesKeyBuffer,
            Buffer.from(flipped_iv)
        );
        console.log('Cipher creado correctamente');

        const encryptedResponse = Buffer.concat([
            cipher.update(JSON.stringify(response), "utf-8"),
            cipher.final(),
            cipher.getAuthTag(),
        ]).toString("base64");
        
        console.log('Respuesta encriptada exitosamente');
        return encryptedResponse;
    } catch (error) {
        console.error('Error en encryptResponse:', error);
        throw new Error('Failed to encrypt response');
    }
};

// Variables para caché
let cachedServices = null;
let cachedLocations = null;
let lastCacheUpdate = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const ENDPOINT_TIMEOUT = 30000; // 30 segundos

app.post("/flow/data", async (req, res) => {
    console.log('\n==========================================');
    console.log('NUEVA PETICIÓN A /FLOW/DATA:', new Date().toISOString());
    console.log('------------------------------------------');
    
    try {
        const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(req.body);
        console.log("Cuerpo descifrado:", JSON.stringify(decryptedBody, null, 2));
        
        let response;
        
        // Health check request
        if (decryptedBody.action === 'ping') {
            console.log('Health check (ping) detectado');
            response = {
                data: {
                    status: "active"
                }
            };
        }
        // Initial request cuando se abre el flow
        else if (decryptedBody.action === 'INIT') {
            console.log('Petición inicial (INIT) detectada');
            response = {
                screen: "SERVICE_AND_LOCATION",
                data: {
                    services: servicios.map(servicio => ({
                        id: servicio.servicioID.toString(),
                        title: servicio.servicio
                    })),
                    locations: salones
                        .filter(salon => ["Nervion Caballeros", "Nervion Señoras", "Duque", "Sevilla Este"]
                            .some(nombre => salon.nombre.includes(nombre)))
                        .map(salon => ({
                            id: salon.salonID.toString(),
                            title: salon.nombre
                        }))
                }
            };
        }
        // Handle error notification
        else if (decryptedBody.data?.error) {
            console.log('Error notification recibida:', decryptedBody.data.error);
            response = {
                data: {
                    acknowledged: true
                }
            };
        }
        // Data exchange requests
        else if (decryptedBody.action === 'data_exchange') {
            console.log('Petición de intercambio de datos detectada');
            switch(decryptedBody.screen) {
                case "SERVICE_AND_LOCATION":
                    // Procesar según los datos recibidos
                    response = {
                        screen: "APPOINTMENT_DETAILS",
                        data: {
                            available_staff: [], // Llenar con datos reales
                            available_dates: [], // Llenar con datos reales
                            available_times: []  // Llenar con datos reales
                        }
                    };
                    break;
                // Agregar otros casos según sea necesario
            }
        }

        console.log('------------------------------------------');
        console.log('Respuesta a enviar:', JSON.stringify(response, null, 2));
        const encryptedResponse = encryptResponse(response, aesKeyBuffer, initialVectorBuffer);
        res.send(encryptedResponse);

    } catch (error) {
        console.error('Error procesando petición:', error);
        if (error instanceof FlowEndpointException) {
            res.status(error.statusCode).send();
        } else {
            res.status(500).send();
        }
    }
});

app.post("/flow/confirm-appointment", async (req, res) => {
    try {
        const {
            service_id,
            location_id,
            date,
            time,
            staff_id,
            customer_name,
            customer_phone
        } = req.body;

        const tempConversation = new Conversation();
        tempConversation.from = customer_phone;
        tempConversation.nombre = customer_name;
        tempConversation.salonID = location_id;
        tempConversation.nombreServicio = service_id;
        tempConversation.peluquero = peluqueros.find(p => p.peluqueroID === staff_id);
        
        const horaInicio = moment(`${date} ${time}`);
        const horaFin = horaInicio.clone().add(
            servicios.find(s => s.servicioID === service_id)?.duracion || 30,
            'minutes'
        );

        const saved = await MongoDB.GuardarEventoEnBD(
            tempConversation,
            horaInicio.format(),
            horaFin.format()
        );

        if (saved) {
            await statisticsManager.incrementConfirmedAppointments();
            await LogSuccess(
                customer_phone,
                'Cita guardada desde flow',
                location_id,
                await MongoDB.ObtenerSalonPorSalonID(location_id)?.nombre
            );
            
            const successResponse = encryptResponse({ success: true });
            res.type('text/plain').send(successResponse);
        } else {
            throw new Error('No se pudo guardar la cita');
        }

    } catch (error) {
        console.error('Error al confirmar la cita:', error);
        try {
            const errorResponse = encryptResponse({ success: false });
            res.status(500).type('text/plain').send(errorResponse);
        } catch (encryptError) {
            console.error('Error al encriptar mensaje de error:', encryptError);
            res.status(500).send('Error interno del servidor');
        }
    }
});*/

app.get("/test", (req, res) => {
  DoLog("TEST");
  res.send("TEST");
});

app.get("/", (req, res) => {
  res.sendStatus(403);
});

// Verificación del webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token) {
    if (mode == "subscribe" && token == WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      DoLog("Webhook verified successfully!");
      return;
    }
  }
  res.sendStatus(403);
});

// Recepción de mensajes desde el webhook
app.post("/webhook", async (req, res) => {
  let curr = Conversation.GetConversation(req);
  if (curr != null) {
    //if (curr.from ?? "" != "") {
    if ((curr.from !== undefined && curr.from !== null) && curr.from !== "") {
      if (curr.lastMsg.audio) {
        // let msg = "En estos momentos no puedo escuchar audios, por favor, escribe tu mensaje.";
        // curr.Responder(msg);
        const transcripcion = await transcribirAudio(curr.lastMsg.audio.id);
        if (transcripcion) {
          curr.lastMsg.type = "text";
          curr.lastMsg.audio = false; // Para que se trate como texto
          curr.lastMsg.who = WhoEnum.User;
          curr.lastMsg.newID = true;
          curr.lastMsg.message = transcripcion;
          curr.AddMsg(curr.lastMsg);
        } else {
          curr.Responder(
            "Lo siento, no consigo escuchar el audio, ¿puedes escribírmelo?"
          );
        }
      }
      if (curr.lastMsg.type === "interactive") {
        const message = req.body.entry[0].changes[0].value.messages[0];

        if (message.interactive && message.interactive.nfm_reply) {
          const responseData = JSON.parse(
            message.interactive.nfm_reply.response_json
          );
          const dateNow = moment().tz("Europe/Madrid").format();

          // Guarda todos los campos dinámicos automáticamente
          const surveyResponse = new SurveyResponse({
            phoneNumber: curr.from,
            date: dateNow,
            ...responseData, // Extiende el objeto con los datos dinámicos
          });

          //console.log(surveyResponse);
          try {
            await surveyResponse.save();
            statisticsManager.incrementFeedbackResponses();
          } catch (error) {
            console.error("Error saving survey response:", error);
          }
        }
      } else {
        curr.lastMsg.who = WhoEnum.User;
        curr.lastMsg.newID = true;
        curr.AddMsg(curr.lastMsg);
        //console.log("curr.lastMsg:", curr.lastMsg);
      }
    }
  }
  res.sendStatus(200);
});

async function transcribirAudio(mediaId) {
  try {
      // Obtener URL del audio desde WhatsApp
      const mediaResponse = await axios.get(`https://graph.facebook.com/v15.0/${mediaId}`, {
          headers: { "Authorization": `Bearer ${GRAPH_API_TOKEN}` }
      });
      const audioUrl = mediaResponse.data.url;
      if (!audioUrl) throw new Error("No se pudo obtener la URL del audio");

      // Descargar audio
      const response = await axios.get(audioUrl, {
          headers: { "Authorization": `Bearer ${GRAPH_API_TOKEN}` },
          responseType: "arraybuffer"
      });
      const audioBuffer = response.data;
      const audioPath = "/tmp/audio.ogg";
      fs2.writeFileSync(audioPath, audioBuffer);

      // Validar que sea un .ogg y que no esté vacío
      const stats = fs2.statSync(audioPath);
      if (path.extname(audioPath) !== ".ogg" || stats.size === 0) {
          throw new Error("Archivo de audio inválido.");
      }

      // Enviar a Whisper (OpenAI)
      const formData = new FormData();
      formData.append("file", fs2.createReadStream(audioPath));
      formData.append("model", "whisper-1");

      const whisperResponse = await axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
          headers: {
              ...formData.getHeaders(),
              "Authorization": `Bearer ${OPENAI_API_KEY}`
          }
      });

      return whisperResponse.data.text;
  } catch (error) {
      //await LogError(this.from, `Error al transcribir audio`, error.message);
      DoLog(`Error al transcribir audio:${error}`, Log.Error);
      return null;
  }
}

// Función para registrar logs
async function DoLog(txt, type = Log.Log) {
  // 1. Mantener el log en consola como está ahora
  const fecha = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
  const msg = `${fecha} - ${txt}`;

  switch (type) {
    case Log.Log:
      console.log(msg);
      break;
    case Log.Error:
      console.error(msg);
      break;
  }

  // 2. Guardar en MongoDB solo si hay una conversación activa
  try {
    // Obtener la conversación activa (la última del objeto conversaciones)
    const activeConversation = Object.values(conversaciones).find(conv => conv.from);
    
    if (activeConversation?.from) {
      // Buscar el log activo o crear uno nuevo
      const logType = type === Log.Error ? 'error' : 'log';
      const update = {
        $push: {
          logs: {
            timestamp: new Date(),
            type: logType,
            message: msg
          }
        }
      };

      await Logs.findOneAndUpdate(
        {
          from: activeConversation.from,
          endedAt: null // Solo actualizar logs activos
        },
        update,
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    }
  } catch (error) {
    console.error(`Error guardando log en MongoDB: ${error}`);
  }
}

async function LogError(phoneNumber, message, error, centerID, centerName) {
  const errorDate = moment().tz("Europe/Madrid").format(); // Fecha actual con zona horaria de Madrid

  const errorData = new MetaData({
    phoneNumber: phoneNumber,
    centerID: centerID,
    centerName: centerName,
    type: "error",
    message: message || error.message, // Mensaje de error
    partOfProgram: error.stack, // Traza completa del error
    date: errorDate, // Fecha y hora con zona horaria de Madrid
  });

  //console.log("Datos del error preparados para el log:", errorData);

  if (centerID) {
    const newNote = new Notes({
      _id: new ObjectId(),
      text: `LLAMAR a ${phoneNumber}`,
      date: errorDate,
      centerInfo: new ObjectId(centerID),
    });
    await newNote.save();
    DoLog(
      `Nota creada correctamente para el centro (${centerID}): LLAMAR a ${phoneNumber}`
    );
  }

  try {
    await errorData.save(); // Try to save the log data
    DoLog(`Error de la aplicación enviado guardado en MONGO correctamente.`);
    //console.log("Error log saved successfully.");
  } catch (saveError) {
    DoLog(`Error al guardar error a MONGO:${saveError}`, Log.Error);
    console.error("Error while saving to MongoDB:", saveError.message); // Catch errors during save
  }

  // Sending email with the error details
  const emailText = `
    <p>Error ocurrido en la aplicación:</p>
  <ul>
    <li><strong>Número de cliente:</strong> ${phoneNumber}</li>
    <li><strong>CentroID:</strong> ${centerID}</li>
    <li><strong>Centro seleccionado:</strong> ${
      centerName || "Centro no especificado"
    }</li>
    <li><strong>Fecha y hora (Madrid):</strong> ${errorDate}</li>
    <li><strong>Mensaje de error:</strong> ${message || error.message}</li>
    <li><strong>Traza completa del error:</strong><br><pre>${
      error.stack
    }</pre></li>
  </ul>
  `;

  try {
    await sendEmail("Error en la aplicación", emailText);
    DoLog(`Error de la aplicación enviado a admin@ynok.eu correctamente.`);
    //console.log("Correo de error enviado correctamente");
  } catch (emailError) {
    DoLog(`Error al enviar email: ${emailError}`, Log.Error);
    console.error(
      "Error al intentar enviar el correo de error:",
      emailError.message
    );
  }
}

async function LogSuccess(phoneNumber, message, centerID, centerName) {
  const successDate = moment().tz("Europe/Madrid").format(); // Fecha actual con zona horaria de Madrid

  const successData = new MetaData({
    phoneNumber,
    type: "success", // Tipo de registro
    message: message, // Mensaje asociado con el éxito
    centerID: centerID || "ID no especificado", // ID del centro, o texto por defecto
    centerName: centerName || "Nombre del centro no especificado", // Nombre del centro
    date: successDate, // Fecha y hora con zona horaria de Madrid
  });

  try {
    await successData.save(); // Guardar el registro en la base de datos
    //console.log(`Éxito registrado: ${message} - Centro: ${centerName || centerID}`);
  } catch (error) {
    console.error("Error al registrar el éxito:", error);
  }
}

// Función auxiliar para obtener la conversación activa
function getActiveConversation() {
  return Object.values(conversaciones).find(conv => conv.from);
}

// Sobreescribir console.log
console.log = async function(...args) {
  // Mantener el comportamiento original
  originalLog.apply(console, args);

  try {
    const activeConversation = getActiveConversation();
    if (activeConversation?.from) {
      const msg = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
      ).join(' ');

      await Logs.findOneAndUpdate(
        {
          from: activeConversation.from,
          endedAt: null
        },
        {
          $push: {
            logs: {
              timestamp: new Date(),
              type: 'log',
              message: msg
            }
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    }
  } catch (error) {
    originalError.call(console, 'Error guardando console.log en MongoDB:', error);
  }
};

// Sobreescribir console.error
console.error = async function(...args) {
  // Mantener el comportamiento original
  originalError.apply(console, args);

  try {
    const activeConversation = getActiveConversation();
    if (activeConversation?.from) {
      const msg = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
      ).join(' ');

      await Logs.findOneAndUpdate(
        {
          from: activeConversation.from,
          endedAt: null
        },
        {
          $push: {
            logs: {
              timestamp: new Date(),
              type: 'error',
              message: msg
            }
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    }
  } catch (error) {
    originalError.call(console, 'Error guardando console.error en MongoDB:', error);
  }
};

class Conversation {
  static GetConversation(req) {
    let rtn = null;
    let from =
      req?.body?.entry?.[0]?.changes[0]?.value?.messages?.[0]?.from ?? null;
    if (from) {
      //comprueba si ya existe conversacion del from
      if (Object.keys(conversaciones).indexOf(from) < 0) {
        rtn = new Conversation();
        rtn.InitFromReq(req);
        conversaciones[from] = rtn;
        rtn.startedAt = new Date();
        //console.log("rtn.startedAt:", rtn.startedAt);
        DoLog(`Conversacion con ${from} iniciada`);

        // Incrementar interacciones (nueva conversación)
        statisticsManager.incrementInteractions();
      } else {
        //si existe la obtiene del array
        rtn = conversaciones[from];
      }
      rtn.lastMsg = new Message();
      rtn.lastMsg.InitFromReq(req);
    }
    return rtn;
  }

  constructor() {
    this.from = "";
    this.lastMsg = new Message();
    this.messages = [];
    this.borrarTimeOut = null;
    this.startedAt = null;
    this.endedAt = null;
    this.responderTimeOut = null;
    this.watchdogTimeOut = null;
    this.especialidad = "";
    this.especialidadID = "";
    this.watchdogCount = 3;
    this.full = "";
    this.salonID = "";
    this.salonNombre = "";
    this.duracionServicio = 30;
    this.nombreServicio = "";
    this.fecha = "";
    this.hora = "";
    this.peluquero = "";
    this.peluqueroNombre = "";
    this.isRandom = false;
    this.nombre = "";
    this.citaGuardada = false;

    // Variables nuevas para modificación de cita
    this.citaAntigua = null; // Almacena la cita existente antes de la modificación
    this.modificacionActiva = false; // Indica si estamos en el proceso de modificación

    this.logId = new mongoose.Types.ObjectId();
    this.initializeLog();
    this.commandQueue = new CommandQueue();
  }

  // inicia conversacion desde la request
  InitFromReq(req) {
    let value = req?.body?.entry?.[0]?.changes[0]?.value ?? null;
    let msg_obj = value?.messages?.[0] ?? null;
    _phone_number_id = value?.metadata?.phone_number_id ?? _phone_number_id;
    this.from = msg_obj?.from ?? "";

    if (this.from) {
      const newLog = new Logs({
        _id: this.logId,
        from: this.from,
      });
      newLog
        .save()
        .catch((err) => DoLog(`Error saving log: ${err}`, Log.Error));
    }
  }

  Init(phone_number_id, from) {
    _phone_number_id = phone_number_id ?? _phone_number_id;
    this.from = from ?? "";
  }

  // responder whatsapp
  async Responder(body) {
    await WhatsApp.Responder(_phone_number_id, this.from, body);
    let ids = this.GetNewID();
    await WhatsApp.MarkRead(_phone_number_id, ids);
  }

  ExistsID(id) {
    let rtn = false;
    for (let i = 0; i < this.messages.length; ++i) {
      if (this.messages[i].msg_id == id) {
        rtn = true;
        break;
      }
    }
    return rtn;
  }

  // añade mensaje al bloque de mensajes
  AddMsg(msg) {
    this.CancelBorrar(true);
    if (msg.who == WhoEnum.User) {
      if (!this.ExistsID(msg.msg_id)) {
        this.CancelResponder(true);
        this.messages.push(msg);
      }
    } else {
      this.messages.push(msg);
    }
    // Guardar la conversación directamente después de cada mensaje
    // MongoDB.GuardarConversacion(this.from, this.messages);
  }

  async Borrar() {
    this.CancelResponder();
    this.CancelWatchDog();
    this.CancelBorrar();
    this.endedAt = new Date(new Date().getTime() - 15 * 60 * 1000);
    // Concatenar la conversación en un solo string
    let conversationText = this.messages
      .map((msg) => {
        switch (msg.who) {
          case WhoEnum.User:
            return `Cliente: ${msg.message}`;
          case WhoEnum.ChatGPT:
            return `ChatGPT: ${msg.message}`;
          case WhoEnum.System:
            return `Sistema: ${msg.message}`;
          default:
            return msg.message;
        }
      })
      .join("\n");

    //console.log("this.startedAt", this.startedAt);
    console.log("this.endedAt", this.endedAt);
    // Crear un nuevo documento para guardar en MongoDB
    const chatHistory = new ChatHistory({
      from: this.from,
      conversation: conversationText, // Guardar la conversación como un solo string
      startedAt: this.startedAt, // Fecha de inicio de la conversación
      endedAt: this.endedAt, // Fecha de fin de la conversación
    });

    //console.log(chatHistory);

    try {
      // Guardar en MongoDB usando await
      await chatHistory.save();
      DoLog(`Conversación con ${this.from} guardada en MongoDB correctamente`);
    } catch (err) {
      DoLog(`Error al guardar la conversación en MongoDB: ${err}`, Log.Error);
    }

    // guardar Logs
    try {
      // Cerrar el log actual
      await Logs.findByIdAndUpdate(
        this.logId,
        { 
          endedAt: new Date(),
          $push: {
            logs: {
              timestamp: new Date(),
              type: 'log',
              message: `Conversación finalizada después de ${this.messages.length} mensajes`
            }
          }
        }
      );
    } catch (error) {
      console.error(`Error cerrando log: ${error}`);
    }

    // Enviar encuesta y eliminar la conversación
    await WhatsApp.enviarEncuesta(_phone_number_id, this.from);
    delete conversaciones[this.from];
    DoLog(
      `Conversacion con ${this.from} finalizada tras ${this.messages.length} mensajes`
    );
  }

  // cancelar el temporizador de vigilancia actual. Este contador se utiliza para realizar un seguimiento del número de intentos de manejar la situación problemática.
  // el sistema intentará manejar la situación un número limitado de veces (3 veces, según la implementación actual)
  CancelWatchDog(reRun = false) {
    if (this.watchdogTimeOut) {
      clearTimeout(this.watchdogTimeOut);
      this.watchdogTimeOut = null;
    }
    if (reRun) {
      this.watchdogTimeOut = setTimeout(
        () => this.DoWatchDog(),
        TIMEOUT_WATCHDOG
      );
    } else {
      this.watchdogCount = 3;
    }
  }

  CancelBorrar(reRun = false) {
    // Si existe un temporizador de borrado, se cancela
    if (this.borrarTimeOut) {
      clearTimeout(this.borrarTimeOut);
      this.borrarTimeOut = null;
    }
    // Si se especifica reRun como verdadero, se establece un nuevo temporizador
    if (reRun) {
      // Se configura un nuevo temporizador para llamar a la función Borrar después de un período de tiempo definido
      this.borrarTimeOut = setTimeout(() => this.Borrar(), TIMEOUT_BORRAR);
    }
  }

  CancelResponder(reRun = false) {
    if (this.responderTimeOut) {
      clearTimeout(this.responderTimeOut);
      this.responderTimeOut = null;
    }
    if (reRun) {
      this.responderTimeOut = setTimeout(
        () => this.Process(),
        TIMEOUT_RESPONDER
      );
    }
  }

  // si entra es porque va a reintentar un error y reduce el temporizador una vez
  async DoWatchDog() {
    console.log("\n=== INICIO DOWATCHDOG ===");
    this.CancelWatchDog(true);
    --this.watchdogCount;

    console.log("Estado WatchDog:", {
        watchdogCount: this.watchdogCount,
        salonID: this.salonID,
        from: this.from
    });

    if (this.watchdogCount > 0) {
        try {
            // Validar el salonID antes de usarlo
            let validSalonId;
            try {
                // Convertir a ObjectId válido si es posible
                validSalonId = this.salonID ? new ObjectId(this.salonID) : null;
                console.log("SalonID válido:", validSalonId);
            } catch (idError) {
                console.error("Error al validar salonID:", idError);
                validSalonId = null;
            }

            let rtn = new Message(WhoEnum.System);
            rtn.message = "Ha ocurrido un problema al procesar el último mensaje. Por favor, intenta enviar tu mensaje de nuevo.";
            
            // Log detallado del error
            console.log("Registrando error:", {
                mensaje: rtn.message,
                salon: {
                    id: validSalonId,
                    nombre: this.salonNombre
                },
                from: this.from
            });

            DoLog(rtn.message);

            // Registrar error con información validada
            await LogError(
                this.from,
                rtn.message,
                validSalonId, // Usar el ID validado
                this.salonNombre
            );

            this.AddMsg(rtn);

            // Obtener la conversación completa
            const conversacionCompleta = this.GetFull();
            console.log("Longitud de conversación recuperada:", 
                conversacionCompleta ? conversacionCompleta.length : 0);

            // Preparar mensaje para ChatGPT
            let msg = `${conversacionCompleta}.\n 
                      Teniendo toda esta conversación, ¿qué le dirías al cliente? 
                      SOLO escribe el mensaje que debería llegarle al cliente. 
                      Si necesitas realizar una acción (como guardar la cita) 
                      escribe el comando correspondiente y se le enviará al sistema 
                      en vez de al cliente.`;

            // Enviar a ChatGPT y procesar respuesta
            rtn = new Message(WhoEnum.ChatGPT);
            rtn.message = await ChatGPT.SendToGPT(msg);
            
            console.log("Respuesta de ChatGPT recibida:", 
                rtn.message ? rtn.message.substring(0, 100) + "..." : "vacía");

            this.AddMsg(rtn);

            if (rtn.message && rtn.message.trim() !== "") {
                await WhatsApp.Responder(_phone_number_id, this.from, rtn.message);
                this.CancelWatchDog();
                console.log("=== FIN DOWATCHDOG (respuesta enviada) ===\n");
                return;
            }

        } catch (error) {
            console.error("\n=== ERROR EN DOWATCHDOG ===");
            console.error("Detalles del error:", {
                mensaje: error.message,
                stack: error.stack,
                datos: {
                    salonID: this.salonID,
                    from: this.from
                }
            });

            // Registrar error detallado
            await LogError(
                this.from,
                `Error en DoWatchDog: ${error.message}`,
                error,
                this.salonID,
                this.salonNombre
            );

            // Incrementar contador de errores
            await statisticsManager.incrementFailedOperations();
            DoLog(`Error en DoWatchDog: ${error}`, Log.Error);
        }
    }

    // Mensaje de fallback si todo lo demás falla
    try {
        await WhatsApp.Responder(
            _phone_number_id,
            this.from,
            "Lo siento, ha ocurrido un error con el último mensaje, por favor vuelve a enviármelo."
        );
    } catch (sendError) {
        console.error("Error al enviar mensaje de fallback:", sendError);
        DoLog(`Error al enviar mensaje de fallback: ${sendError}`, Log.Error);
    }

    console.log("=== FIN DOWATCHDOG ===\n");
}

  async initializeLog() {
    if (this.from) {
      try {
        const newLog = new Logs({
          _id: this.logId,
          from: this.from
        });
        await newLog.save();
      } catch (error) {
        console.error(`Error inicializando log: ${error}`);
      }
    }
  }

  async Process() {
    this.CancelResponder();
    this.CancelWatchDog(true);
    // Verificar si el último mensaje proviene del usuario
    if (this.lastMsg?.who == WhoEnum.User) {
      try {
        // Cargar el contexto de citas antes de procesar el mensaje
        if (!this.citasContextLoaded) { // Flag para cargar solo una vez
          await this.loadAppointmentsContext();
          this.citasContextLoaded = true;
        }
        
        if (
          this.lastMsg.type == "button" &&
          this.lastMsg.message == "Cancelar cita"
        ) {
          this.lastMsg = null;
          let rtn = new Message(WhoEnum.System);

          // Calcula las fechas relevantes: hoy y mañana
          let today = moment().format("MM/DD/YYYY");
          let tomorrow = moment().add(1, "days").format("MM/DD/YYYY");

          // Busca citas para hoy o mañana
          let appointments = await Appointments.find({
            date: { $in: [today, tomorrow] },
            clientPhone: this.from,
          });

          if (appointments.length == 0) {
            rtn.message = "No tienes ninguna cita para hoy ni para mañana.";
          } else {
            let details = appointments.map((appointment) =>
              JSON.stringify(appointment, null, 2)
            );

            // Actualizar el status de todas las citas a "canceled"
            await Appointments.updateMany(
              {
                date: { $in: [today, tomorrow] },
                clientPhone: this.from,
              },
              { $set: { status: "canceled" } }
            );

            await statisticsManager.incrementCanceledAppointments(
              appointments.length
            );
            console.log(
              `${appointments.length} citas se han marcado como canceladas`
            );

            rtn.message = `*Tu cita ha sido cancelada correctamente.*\n\nGracias por cancelarla. Puedes volver a escribirnos por aquí si quieres volver a pedir una cita o para cualquier cosa que necesites. Que tengas buen día.`;
          }

          this.AddMsg(rtn);
          await WhatsApp.Responder(_phone_number_id, this.from, rtn.message);
          this.CancelResponder();
          this.CancelWatchDog();
        } else {
          this.lastMsg = null;
          this.GetFull();
          console.log("this.full:", this.full);
          let gptResponse = await ChatGPT.SendToGPT(this.full);
          let rtn = "";
          let gpt = new Message(WhoEnum.ChatGPT);
          gpt.message = gptResponse;
          this.AddMsg(gpt);

          let lines = gptResponse
            .split("\n")
            .filter((line) => line.trim() !== "");
          console.log("lines:", lines);

          // Añadir cada línea como un comando separado a la cola
          let hasCommands = false;
          for (let line of lines) {
            if (
              line.includes("SERV") ||
              line.includes("SPECIALITY") ||
              line.includes("CENTROID") ||
              line.includes("LISTAPELUQ") ||
              line.includes("GUARDACITA") ||
              line.includes("CANCELACITA") ||
              line.includes("CONSULTHOR") ||
              line.includes("BUSCARCITA") ||
              line.includes("MODCITA") ||
              line.includes("SALON") ||
              line.includes("CENTROINFO")||
              line.includes("FLOWCITA")
            ) {
              this.commandQueue.addCommand(line);
              hasCommands = true;
            }
          }

          if (hasCommands) {
            // Si hay comandos, procesarlos
            rtn = await this.commandQueue.processNextCommand(this);
            console.log("rtn:", rtn);
          } else {
            // Si no hay comandos, usar la respuesta directa de GPT
            rtn = gptResponse;
            console.log("rtn 2:", rtn);
          }

          // Si hay una respuesta final, enviarla
          if (rtn != "") {
            await WhatsApp.Responder(_phone_number_id, this.from, rtn);
            this.CancelWatchDog();
          }
          return rtn;
        }
      } catch (ex) {
        DoLog(`Error en Process ${ex}`, Log.Error);
      }
    }
  }

  async ProcessOne(gpt) {
    gpt.SetGPT();
    if (gpt.GPT != GPTEnum.NONE) {
      DoLog(gpt.message);
    }
    let rtn = "";
    
    try {
      switch (gpt.GPT) {
        case GPTEnum.SERV:
          rtn = await this.ProcesarSolicitudDeServicio(gpt.message);
          break;
        case GPTEnum.SPECIALITY:
          rtn = await this.ProcesarSpeciality(gpt.message);
          break;
        case GPTEnum.CENTROID:
          rtn = await this.ProcesarCentro(gpt.message);
          break;
        case GPTEnum.LISTAPELUQ:
          rtn = await this.ProcesarPeluquero(gpt.message);
          break;
        case GPTEnum.GUARDACITA:
          rtn = await this.ProcesarCita(gpt.message);
          break;
        case GPTEnum.CANCELACITA:
          rtn = await this.ProcesarCancelacionCita(gpt.message);
          break;
        case GPTEnum.CONSULTHOR:
          rtn = await this.ProcesarConsultarHorario(gpt.message);
          break;
        case GPTEnum.BUSCARCITA:
          rtn = await this.buscarCitas(gpt.message);
          break;
        case GPTEnum.MODCITA:
          rtn = await this.ProcesarModificacionCita(gpt.message);
          break;
        case GPTEnum.SALON:
          rtn = await this.ProcesarSalon(gpt.message);
          break;
        case GPTEnum.CENTROINFO:
          rtn = await this.ProcesarInfoCentro(gpt.message);
          break;
        case GPTEnum.NONE:
          rtn = gpt.message;
          break;
      }
      return rtn;
    } catch (error) {
      // Intentar corregir y reprocesar el comando
      try {
        DoLog(`Error detectado en comando ${gpt.GPT}: ${error.message}`, Log.Error);
        rtn = await ErrorHandler.handleCommandError(gpt.message, error, this);
        return rtn;
      } catch (correctionError) {
        // Si falla la corrección, registrar el error y continuar con el manejo normal de errores
        DoLog(`Error en la corrección del comando: ${correctionError}`, Log.Error);
        throw error; // Relanzar el error original si la corrección falla
      }
    }
  }

  GetFull() {
    this.full = "";
    for (let i = 0; i < this.messages.length; ++i) {
      switch (this.messages[i].who) {
        case WhoEnum.User:
          this.full += `El cliente ${this.from} ha dicho: [${this.messages[i].message}].\n`;
          break;
        case WhoEnum.ChatGPT:
          this.full += `Y tú le has respondido: [${this.messages[i].message}].\n`;
          break;
        case WhoEnum.System:
          this.full += `El sistema ha dicho: [${this.messages[i].message}].\n`;
          break;
      }
    }
    return this.full;
  }

  GetNewID() {
    let rtn = [];
    for (let i = 0; i < this.messages.length; ++i) {
      if (this.messages[i].newID) {
        if (this.messages[i].msg_id ?? "" != "") {
          rtn.push(this.messages[i].msg_id);
        }
        this.messages[i].newID = false;
      }
    }
    return rtn;
  }
  
  async loadAppointmentsContext() {
  try {
    const today = moment().format("MM/DD/YYYY");
    const tomorrow = moment().add(1, "days").format("MM/DD/YYYY");

    const proximasCitas = await Appointments.find({
      clientPhone: this.from,
      date: { $in: [today, tomorrow] },
      status: "confirmed"
    });

    //console.log(proximasCitas);
    let rtn = new Message(WhoEnum.System);

    if (proximasCitas && proximasCitas.length > 0) {
      let citasInfo = proximasCitas.map(async (cita) => {
        // Buscar información del centro y peluquero de forma segura
        const centro = await Centers.findById(cita.centerInfo);
        const peluquero = await Users.findById(cita.userInfo);
        
        const fecha = moment(cita.date, "MM/DD/YYYY").format("DD/MM/YYYY");
        const servicios = cita.services?.map(s => s.serviceName).join(", ") || "No especificado";
        const nombreCentro = centro?.centerName || "Centro no especificado";
        const nombrePeluquero = peluquero?.name || "Peluquero no especificado";
        
        return `Fecha: ${fecha}
          Hora: ${cita.initTime || "No especificada"}
          Centro: ${nombreCentro}
          Peluquero: ${nombrePeluquero}
          Servicios: ${servicios}`;
      });

      // Esperar a que se resuelvan todas las promesas de búsqueda
      const citasResueltas = await Promise.all(citasInfo);
      
      // Unir toda la información en un solo mensaje
      rtn.message = `El cliente tiene las siguientes citas próximas:\n\n${citasResueltas.join("\n\n")}`;
    } else {
      rtn.message = "El cliente no tiene citas programadas para hoy ni mañana.";
    }

    this.AddMsg(rtn);
  } catch (error) {
    DoLog(`Error al buscar citas próximas: ${error}`, Log.Error);
    await LogError(
      this.from,
      "Error al buscar citas próximas",
      error,
      this.salonID,
      this.salonNombre
    );
  }
}

  async ProcesarSolicitudDeServicio(gpt) {
    let msg = gpt.replace("SERV", "").replace("[", "").replace("]", "").trim();

    //console.log(`Mensaje recibido para procesamiento de servicios: "${msg}"`);

    // Identificar servicios individuales (separados por ",", "y", etc.)
    let serviciosIdentificados = msg.split(/,| y /).map((s) => s.trim());
    //console.log(`Servicios identificados: ${JSON.stringify(serviciosIdentificados)}`);

    let serviciosIDs = [];
    let duracionTotal = 0;

    // Obtener los IDs de los servicios a través de CalculaServicioID
    for (let servicio of serviciosIdentificados) {
      //console.log(`Procesando servicio: "${servicio}"`);

      // Obtener el ID del servicio usando la función CalculaServicioID
      let servicioID;
      try {
        servicioID = await ChatGPT.CalculaServicioID(servicio);
      } catch (error) {
        try {
          const rtn = await ErrorHandler.handleCommandError(gpt.message, error, this);
          return rtn;
      } catch (correctionError) {
          // Si falla la corrección, registrar el error y continuar con el manejo normal de errores
          DoLog(`Error en la corrección del comando: ${correctionError}`, Log.Error);
          throw error; // Relanzar el error original si la corrección falla
      }
        console.error(`Error al identificar el servicio ${servicio}: ${error}`);
        return `Ocurrió un error al procesar el servicio "${servicio}".`;
      }

      if (servicioID) {
        //console.log(`Servicio identificado: ${servicio} -> ID: ${servicioID}`);
        serviciosIDs.push(servicioID);

        // Buscar información del servicio (duración, etc.)
        //console.log("Servicios disponibles:", servicios);
        let servicioInfo = servicios.find(
          (s) => s.servicioID.toString() === servicioID
        ); // Cambio aquí

        if (servicioInfo) {
          //console.log(`Servicio encontrado en la lista: ${JSON.stringify(servicioInfo)}` );
          duracionTotal += parseInt(servicioInfo.duracion); // Sumamos la duración del servicio
        } else {
          console.error(
            `Error: No se encontró información del servicio con ID: ${servicioID}`
          );
          return `Error: No se pudo encontrar información para el servicio "${servicio}".`;
        }
      } else {
        //console.log(`No se encontró el servicio: ${servicio}`);
        return `No se pudo identificar el servicio "${servicio}".`;
      }
    }

    // Confirmación y almacenamiento de servicios
    let rtn = new Message(WhoEnum.System);
    if (serviciosIDs.length > 0) {
      let nombresServicios = servicios
        .filter((s) => serviciosIDs.includes(s.servicioID.toString()))
        .map((s) => s.servicio); // Cambio aquí
      //console.log(`Servicios confirmados: ${nombresServicios.join(", ")} con una duración total de ${duracionTotal} minutos`);

      rtn.message = `Comando SERV confirmado. Los servicios que desea agendar el cliente ${
        this.from
      } son "${nombresServicios.join(
        ", "
      )}", con una duración total de ${duracionTotal} minutos.`;
    } else {
      //console.log(`No se pudieron identificar correctamente los servicios solicitados.`);
      rtn.message = `No se pudieron identificar correctamente los servicios solicitados.`;
    }

    DoLog(rtn.message);
    this.AddMsg(rtn);

    // Almacenar la información de los servicios y la duración
    this.nombreServicio = serviciosIDs; // Guardamos los IDs de los servicios
    this.duracionServicio = duracionTotal;

    return "";
  }

  async ProcesarSpeciality(gpt) {
    let msg = gpt
      .replace("SPECIALITY", "")
      .replace("[", "")
      .replace("]", "")
      .trim();
    let rtn = new Message(WhoEnum.System);
    this.especialidadID = "";
    this.especialidad = "";
    for (let especialidad of especialidades) {
      if (especialidad.name.toUpperCase() == msg.toUpperCase()) {
        this.especialidadID = especialidad.especialidadID;
        this.especialidad = especialidad.name;
      }
    }
    if (this.especialidadID != "") {
      rtn.message = `Comando SPECIALITY confirmado. El servicio que desea agendar el cliente es de tipo "${this.especialidad}" con ID "${this.especialidadID}".`;
    } else {
      rtn.message = `No se pudo identificar la especialidad "${msg}" para el cliente${this.from}.`;
    }
    DoLog(rtn.message);
    this.AddMsg(rtn);
    return "";
  }

  async ProcesarCentro(gpt) {
    let msg = gpt
      .replace("CENTROID", "")
      .replace("[", "")
      .replace("]", "")
      .trim();
    let centro = "";
    let centroValido = false;
    for (let i = 1; i <= 3; ++i) {
      centro = await ChatGPT.CalculaCentroID(msg);
      if (centro != "") {
        this.salonID = centro;
        let salon = await MongoDB.ObtenerSalonPorSalonID(this.salonID);
        this.salonNombre = salon.nombre;
        centroValido = true;
        break;
      } else {
        this.salonID = "";
      }
      sleep(100);
    }
    let rtn = new Message(WhoEnum.System);
    if (!centroValido) {
      rtn.message = `No se pudo identificar el centro "${msg}" para el cliente ${this.from}.`;
    } else {
      rtn.message = `Comando CENTROID confirmado. El salon que desea agendar el cliente ${this.from} es "${this.salonNombre}", con id "${this.salonID}".`;
      if (MongoDB.EsMixto(this.salonID)) {
        rtn.message +=
          ' Clarifica con el cliente si será servicio de "Señora" o "Caballero".';
      }
    }
    DoLog(rtn.message);
    this.AddMsg(rtn);
    return "";
  }

  async ProcesarPeluquero(gpt) {
    console.log("\n=== INICIO PROCESAR PELUQUERO ===");
    let rtn = new Message(WhoEnum.System);
  
    try {
        // 1. Extraer y validar los parámetros de entrada
        const input = gpt.replace("LISTAPELUQ", "").trim();
        // Buscar la fecha ISO (que termina en +XX:XX o Z)
        const fechaMatch = input.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z))/);
        
        if (!fechaMatch) {
            throw new Error("Formato de fecha inválido");
        }
        
        const fechaStr = fechaMatch[1];
        const nombrePeluquero = input.substring(fechaMatch[0].length).trim() || "MOREINFO";
        
        console.log("Parámetros recibidos:", {
            fechaStr,
            nombrePeluquero,
            salonID: this.salonID,
            nombreServicio: this.nombreServicio,
            especialidadID: this.especialidadID,
            duracionServicio: this.duracionServicio
        });

        // 2. Validar formato de fecha
        if (!moment(fechaStr, moment.ISO_8601, true).isValid()) {
            throw new Error("La fecha proporcionada no es válida");
        }

        // 3. Convertir a timezone correcto
        let fecha = moment.tz(fechaStr, "Europe/Madrid");

        // 4. Validar horario comercial (10:00 - 22:00)
        const hora = fecha.tz("Europe/Madrid").format("HH:mm");
        const horarioApertura = moment(hora, "HH:mm").set({hour: 10, minute: 0});
        const horarioCierre = moment(hora, "HH:mm").set({hour: 22, minute: 0});
        
        console.log("Validación de horario:", {
            horasolicitada: hora,
            apertura: horarioApertura.format("HH:mm"),
            cierre: horarioCierre.format("HH:mm")
        });
        
        if (moment(hora, "HH:mm").isBefore(horarioApertura) || 
            moment(hora, "HH:mm").isAfter(horarioCierre)) {
            throw new Error("Horario fuera del horario de atención (10:00 - 22:00)");
        }

        // 5. Verificar prerrequisitos
        console.log("Verificando prerrequisitos:", {
            tieneSalon: !!this.salonID,
            tieneServicio: !!this.nombreServicio,
            tieneEspecialidad: !!this.especialidadID,
            esSalonMixto: MongoDB.EsMixto(this.salonID)
        });

        if (!this.salonID) {
            throw new Error("¿Me podrías decir a qué salón te gustaría ir?");
        }

        if (!this.nombreServicio) {
            throw new Error("¿Qué servicio te gustaría reservar?");
        }

        if (!this.especialidadID && MongoDB.EsMixto(this.salonID)) {
            throw new Error("¿El servicio sería para señora o caballero?");
        }

        // 6. Guardar información de la cita
        this.fecha = fecha.utc().format("YYYY-MM-DD");
        this.hora = fecha.tz("Europe/Madrid").format("HH:mm:ss");

        console.log("Información de la cita:", {
            fecha: this.fecha,
            hora: this.hora,
            duracionServicio: this.duracionServicio
        });

        // 7. Calcular hora de finalización del servicio
        const horaFinServicio = moment(hora, "HH:mm")
            .add(this.duracionServicio, "minutes")
            .format("HH:mm");

        console.log("Cálculo de finalización:", {
            horaInicio: hora,
            horaFin: horaFinServicio,
            excederaCierre: moment(horaFinServicio, "HH:mm").isAfter(horarioCierre)
        });

        if (moment(horaFinServicio, "HH:mm").isAfter(horarioCierre)) {
            throw new Error(`Lo siento, el servicio dura ${this.duracionServicio} minutos y excedería nuestro horario de cierre. ¿Te gustaría probar con un horario más temprano?`);
        }

        // 8. Obtener peluqueros disponibles
        console.log("\nConsultando disponibilidad de peluqueros...");
        const peluquerosDisponibles = await MongoDB.ListarPeluquerosDisponibles(
            fecha,
            this.salonID,
            this.nombreServicio,
            this.especialidadID,
            this.duracionServicio
        );
        console.log("Peluqueros disponibles:", peluquerosDisponibles);

        // 9. Procesar según si se solicitó un peluquero específico o no
        if (nombrePeluquero !== "MOREINFO") {
            console.log("\nProcesando solicitud para peluquero específico:", nombrePeluquero);
            
            // Calcular el ID del peluquero
            let peluqueroID = await ChatGPT.CalculaPeluquero(nombrePeluquero, this.salonID);

            console.log("Resultado búsqueda peluquero:", {
                nombreBuscado: nombrePeluquero,
                peluqueroID: peluqueroID,
                salonID: this.salonID
            });

            // Buscar el peluquero completo usando el ID
            const peluqueros = await MongoDB.ObtenerPeluqueros(this.salonID);
            for (let peluquero of peluqueros) {
                if (peluquero.peluqueroID == peluqueroID) {
                    this.peluquero = peluquero;
                    this.peluqueroNombre = peluquero.name;
                    break;
                }
            }
            
            if (!this.peluquero) {
                throw new Error(`No encontré al peluquero "${nombrePeluquero}". ¿Podrías confirmar el nombre?`);
            }

            if (peluquerosDisponibles.includes(this.peluquero.peluqueroID)) {
                console.log("Peluquero disponible:", {
                    nombre: this.peluqueroNombre,
                    id: this.peluquero.peluqueroID
                });
                rtn.message = `¡Perfecto! ${this.peluqueroNombre} está disponible para el ${moment(this.fecha).format("DD/MM/YYYY")} a las ${this.hora}. ¿Quieres confirmar la cita?`;
            } else {
                console.log("Buscando horarios alternativos para el peluquero...");
                const horariosAlternativos = await MongoDB.BuscarHorariosDisponiblesPeluquero(
                    this.peluquero.peluqueroID,
                    fecha,
                    this.duracionServicio,
                    this.salonID
                );
                console.log("Horarios alternativos encontrados:", horariosAlternativos);

                if (horariosAlternativos.length > 0) {
                    rtn.message = `${this.peluqueroNombre} no está disponible a las ${this.hora}, pero tiene estos horarios:\n${horariosAlternativos.map(h => `• ${h}`).join("\n")}\n\n¿Te interesa alguno?`;
                } else {
                    console.log("Buscando disponibilidad en próximos días...");
                    const diasDisponibles = await MongoDB.BuscarDisponibilidadSiguienteSemana(
                        this.peluquero.peluqueroID,
                        this.salonID,
                        this.nombreServicio,
                        this.especialidadID,
                        this.duracionServicio,
                        fecha
                    );
                    console.log("Días disponibles encontrados:", diasDisponibles);

                    if (diasDisponibles.length > 0) {
                        rtn.message = `${this.peluqueroNombre} no tiene disponibilidad el ${moment(this.fecha).format("DD/MM/YYYY")}, pero te puedo ofrecer:\n\n${
                            diasDisponibles.map(dia => `*${dia.dia}*: ${dia.horarios.join(", ")}`).join("\n")
                        }\n\n¿Alguno de estos horarios te vendría bien?`;
                    } else {
                        rtn.message = `${this.peluqueroNombre} no tiene disponibilidad en los próximos días. ¿Prefieres que miremos con otro peluquero o probamos otra fecha?`;
                    }
                }
            }
        } else {
            console.log("\nProcesando solicitud sin peluquero específico");
            if (peluquerosDisponibles.length > 0) {
                const nombresPeluqueros = await MongoDB.ObtenerNombresPeluquerosPorIDs(peluquerosDisponibles);
                console.log("Nombres de peluqueros disponibles:", nombresPeluqueros);
                rtn.message = `Para el ${moment(this.fecha).format("DD/MM/YYYY")} a las ${this.hora} tengo disponibles a: ${nombresPeluqueros.join(", ")}. ¿Con quién prefieres la cita?`;
            } else {
                console.log("Buscando horarios alternativos con cualquier peluquero...");
                const horariosConPeluqueros = await MongoDB.BuscarHorariosConPeluquerosDisponibles(
                    this.fecha,
                    this.salonID,
                    this.nombreServicio,
                    this.especialidadID,
                    this.duracionServicio
                );
                console.log("Horarios alternativos encontrados:", horariosConPeluqueros);

                if (horariosConPeluqueros.length > 0) {
                    rtn.message = `Para esa hora exacta no tengo disponibilidad, pero tengo estos horarios:\n\n${
                        horariosConPeluqueros.map(h => `• ${h.hora}: ${h.peluqueroNombre}`).join("\n")
                    }\n\n¿Te interesa alguno?`;
                } else {
                    rtn.message = `Lo siento, no hay disponibilidad para el ${moment(this.fecha).format("DD/MM/YYYY")}. ¿Te gustaría probar otro día?`;
                }
            }
        }

        // 10. Registrar el mensaje en el sistema
        console.log("\nMensaje final:", rtn.message);
        DoLog(rtn.message);
        this.AddMsg(rtn);
        console.log("=== FIN PROCESAR PELUQUERO ===\n");
        return "";

    } catch (error) {
        try {
            const errorResponse = await ErrorHandler.handleCommandError(gpt, error, this);
            return errorResponse;
        } catch (correctionError) {
            // Si falla la corrección, registrar el error y continuar con el manejo normal de errores
            DoLog(`Error en la corrección del comando: ${correctionError}`, Log.Error);
            
            console.error("\n=== ERROR EN PROCESAR PELUQUERO ===");
            console.error("Detalles del error:", {
                mensaje: error.message,
                stack: error.stack,
                datos: {
                    fecha: this.fecha,
                    hora: this.hora,
                    salon: this.salonID,
                    servicio: this.nombreServicio
                }
            });
            
            const errorMsg = `Error al procesar la disponibilidad: ${error.message}`;
            DoLog(errorMsg, Log.Error);
            await LogError(
                this.from,
                errorMsg,
                error,
                this.salonID,
                this.salonNombre
            );
            await statisticsManager.incrementFailedOperations();
            
            rtn.message = "Lo siento, ha ocurrido un error al verificar la disponibilidad. ¿Podrías intentarlo de nuevo?";
            this.AddMsg(rtn);
            console.log("=== FIN ERROR PROCESAR PELUQUERO ===\n");
            return "";
        }
    }
}

  async ProcesarCita(gpt) {
    DoLog(`Iniciando ProcesarCita con input: ${gpt}`);
    
    // Dividir el comando en partes para extraer los datos de la cita
    let partesCita = gpt.split("|");
    DoLog(`Partes de la cita extraídas: ${JSON.stringify(partesCita)}`);
    
    this.nombreServicio = partesCita[1].trim();
    let fechaHora = partesCita[2].trim();
    this.salonNombre = partesCita[3].trim();
    this.peluqueroNombre = partesCita[4].trim();
    this.nombre = partesCita[5]
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    DoLog(`Datos procesados:
    - Servicio: ${this.nombreServicio}
    - Fecha/Hora: ${fechaHora}
    - Salón: ${this.salonNombre}
    - Peluquero: ${this.peluqueroNombre}
    - Cliente: ${this.nombre}`);

    let rtn = new Message(WhoEnum.System);
    let falta = [];
    let fechaIni = null;
    let fechaFin = null;
    this.peluquero = "";

    // Validación del servicio
    DoLog(`Iniciando validación del servicio: ${this.nombreServicio}`);
    if (this.nombreServicio == "") {
      falta.push("Servicio");
      DoLog("Error: Servicio vacío");
    } else {
      this.servicioID = await ChatGPT.CalculaServicioID(this.nombreServicio);
      DoLog(`ServicioID calculado: ${this.servicioID}`);
      if (this.servicioID == "") {
        falta.push("Servicio");
        DoLog("Error: No se pudo calcular el ServicioID");
      }
    }

    // Procesamiento de fecha y hora
    DoLog("Iniciando procesamiento de fecha y hora");
    let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const moment = require("moment-timezone");
    let citaInicioConZona = moment.tz(fechaHora, "Europe/Madrid").format();
    let fechaHoraFin = moment
      .tz(citaInicioConZona, "Europe/Madrid")
      .add(this.duracionServicio, "minutes")
      .format();
    
    DoLog(`Fecha/hora procesada:
    - Timezone: ${timezone}
    - Inicio: ${citaInicioConZona}
    - Fin: ${fechaHoraFin}
    - Duración: ${this.duracionServicio} minutos`);

    // Validación del salón
    DoLog(`Iniciando validación del salón. SalonID actual: ${this.salonID}`);
    if (this.salonID == "") {
      falta.push("Salón");
      DoLog("Error: SalonID vacío");
    } else {
      let salon = await MongoDB.ObtenerSalonPorSalonID(this.salonID);
      DoLog(`Datos del salón obtenidos: ${JSON.stringify(salon)}`);
      this.salonID = salon.salonID;
      this.salonNombre = salon.nombre;
    }

    // Validación del peluquero
    DoLog(`Iniciando validación del peluquero: ${this.peluqueroNombre}`);
    if (this.peluqueroNombre == "") {
      falta.push("Peluquero");
      DoLog("Error: Nombre de peluquero vacío");
    } else {
      let peluqueroID = await ChatGPT.CalculaPeluquero(
        this.peluqueroNombre,
        this.salonID
      );
      DoLog(`PeluqueroID calculado: ${peluqueroID}`);

      for (let peluquero of peluqueros) {
        DoLog(`Comparando con peluquero: ${peluquero.peluqueroID}`);
        if (peluquero.peluqueroID == peluqueroID) {
          this.peluquero = peluquero;
          DoLog(`Peluquero encontrado: ${JSON.stringify(peluquero)}`);
          break;
        }
      }
      if (this.peluquero == "") {
        falta.push("Peluquero");
        DoLog("Error: No se encontró el peluquero en la lista");
      }
    }

    // Validación del nombre del cliente
    DoLog(`Validando nombre del cliente: ${this.nombre}`);
    if (this.nombre == "") {
      falta.push("Nombre cliente");
      DoLog("Error: Nombre de cliente vacío");
    }

    // Manejo de errores en la validación
    if (falta.length > 0) {
      DoLog(`Validación fallida. Faltan los siguientes campos: ${falta.join(", ")}`);
      rtn.message = `Para completar tu reserva, necesitaría que me digas ${falta.join(" y ")}. ¿Me ayudas con esa información?`;
      this.AddMsg(rtn);
      return "";
    }

    // Guardado de la cita
    DoLog("Iniciando guardado de la cita en la base de datos");
    this.citaGuardada = false;  // Inicializamos como false por defecto
    let saved = await MongoDB.GuardarEventoEnBD(
      this,
      citaInicioConZona,
      fechaHoraFin
    );
    
    try {
      if (saved === true) {  // Comparación estricta con true
        DoLog("Cita guardada exitosamente");
        rtn.message = `Comando GUARDACITA confirmado. La cita del cliente ha sido guardada en el sistema.`;
        this.citaGuardada = true;

        await statisticsManager.incrementConfirmedAppointments();
        DoLog("Contador de citas confirmadas incrementado");
        
        await LogSuccess(
          this.from,
          "Cita guardada con éxito",
          this.salonID,
          this.salonNombre
        );

        // Manejo de modificación de cita
        if (this.modificacionActiva && this.citaAntigua) {
          DoLog(`Procesando modificación de cita antigua: ${JSON.stringify(this.citaAntigua)}`);
          await Appointments.updateOne(
            { _id: this.citaAntigua._id },
            { $set: { status: "canceled" } }
          );
          DoLog("Cita antigua marcada como cancelada");
          rtn.message += "La cita anterior ha sido marcada como cancelada.";
          this.modificacionActiva = false;
          this.citaAntigua = null;
          await statisticsManager.incrementModifiedAppointments();
          DoLog("Contador de citas modificadas incrementado");
        }
      } else {
        DoLog("Error: No se pudo guardar la cita");
        rtn.message = `Ha habido un pequeño problema técnico 😅 ¿Podrías intentarlo de nuevo en unos minutos? Si el problema persiste, puedes llamar directamente al salón.`;
        await statisticsManager.incrementFailedOperations();
        await LogError(
          curr.from,
          `Error al guardar la cita`,
          rtn.message,
          this.salonID,
          this.salonNombre
        );
      }
    } catch (ex) {
      try {
        const rtn = await ErrorHandler.handleCommandError(gpt.message, error, this);
        return rtn;
    } catch (correctionError) {
        // Si falla la corrección, registrar el error y continuar con el manejo normal de errores
        DoLog(`Error en la corrección del comando: ${correctionError}`, Log.Error);
        throw error; // Relanzar el error original si la corrección falla
    }
      DoLog(`Error crítico durante el procesamiento: ${ex.message}`);
      DoLog(`Stack trace: ${ex.stack}`);
      await LogError(
        this.from,
        `Error al procesar la cita`,
        ex,
        this.salonID,
        this.salonNombre
      );
    }

    DoLog(`Finalizando ProcesarCita. Mensaje final: ${rtn.message}`);
    this.AddMsg(rtn);
    return "";
}

  async ProcesarCancelacionCita(gpt) {
    let partes = gpt.split(" ");
    let fecha = partes[1];

    let cancelacionExitosa = await MongoDB.BorrarCitas(this.from, fecha);

    let rtn = new Message(WhoEnum.System);

    if (cancelacionExitosa) {
      rtn.message = "¡Listo! He cancelado tu cita. Puedes volver a escribirme cuando quieras para pedir una nueva cita 😊";
      // Incrementar el contador de citas canceladas usando la clase
      await statisticsManager.incrementCanceledAppointments();
    } else {
      rtn.message = `No se pudo cancelar tu cita. Por favor, intenta nuevamente o contacta con nosotros.`;
      // Incrementar el contador de operaciones fallidas usando la clase
      await statisticsManager.incrementFailedOperations();
      await LogError(
        this.from,
        `Error al procesar la solicitud`,
        rtn.message,
        this.salonID,
        this.salonNombre
      );
    }
    DoLog(rtn.message);
    this.AddMsg(rtn);

    return "";
  }

  async buscarCitas(gpt) {
    let rtn = new Message(WhoEnum.System);

    try {
      const from = this.from;
      const today = moment().format("MM/DD/YYYY"); // Format current date to match DB format

      const citas = await Appointments.find({
        clientPhone: from,
        date: { $gte: today },
        status: "confirmed",
      }).sort({ date: 1, initTime: 1 });

      if (citas.length === 0) {
        rtn.message = "No tienes citas programadas próximamente.";
      } else {
        let detalles = citas
          .map((cita) => {
            const fechaFormateada = moment(cita.date, "MM/DD/YYYY").format(
              "DD/MM/YYYY"
            );
            return `📅 Fecha: ${fechaFormateada}\n⏰ Hora: ${cita.initTime} - ${
              cita.finalTime
            }\n🏢 Centro: ${
              this.salonNombre || "No especificado"
            }\n💇 Servicio(s): ${cita.services
              .map((s) => s.serviceName)
              .join(", ")}`;
          })
          .join("\n\n");

        rtn.message = `Estas son tus próximas citas:\n\n${detalles}`;
      }
    } catch (error) {
      rtn.message =
        "Hubo un error al buscar tus citas. Por favor, intenta nuevamente más tarde.";
      DoLog(`Error en buscarCitas: ${error}`, Log.Error);
    }

    DoLog(rtn.message);
    this.AddMsg(rtn);
    return "";
  }

  async ProcesarSolicitudDeHoraDeComida(gpt) {
    let comidaSolicitada = await ChatGPT.IdComida(gpt);
    let partes = comidaSolicitada.split(" ");
    let idPeluquero = partes[0];
    let horaDescanso = partes[1];
    if (moment(horaDescanso, moment.ISO_8601, true).isValid()) {
      let diaISO = moment(horaDescanso);
      let dia = diaISO.format("DD/MM/YYYY");
      let inicioComida = diaISO.format("HH:mm");
      let finComida = diaISO.add(60, "minutes");
      let terminaComida = finComida.format("HH:mm");
      let finComidaISO = finComida.format();
      let salon = MongoDB.ObtenerSalonPorSalonID(this.salonID);
      try {
        await MongoDB.MarcarPeluqueroComida(
          idPeluquero,
          inicioComida,
          finComida
        );
        let rtn = new Message(WhoEnum.System);
        rtn.message = "Tu hora de descanso ha sido reservada";
        this.AddMsg(rtn);
        return rtn.message;
      } catch (ex) {
        DoLog(
          `Error al procesar la solicitud de hora de comida: ${ex}`,
          Log.Error
        );
      }
    }
  }

  async ProcesarBajaPeluquero(gpt) {
    let partes = gpt.split(" ");
    let dia = partes[1];
    let id = partes[2];

    let rtn = new Message(WhoEnum.System);
    rtn.message = await MongoDB.MarcarPeluqueroComoNoDisponible(id, dia);
    this.AddMsg(rtn);

    this.GetFull();
    rtn = new Message(WhoEnum.ChatGPT);
    rtn.message = await ChatGPT.SendToGPT(this.full);
    this.AddMsg(rtn);

    let citas = await MongoDB.buscarCitasDePeluquero(id, dia);
    if (citas.length > 0) {
      await WhatsApp.NotificarClientesSobreCambioDeCita(citas);
    }
    return rtn.message;
  }

  async ProcesarModificacionCita(gpt) {
    let partes = gpt.split(" ");
    let fecha = partes[1];

    const modCita = await Appointments.find({
      date: fecha,
      clientPhone: this.from,
    });

    let rtn = new Message(WhoEnum.System);

    if (modCita && modCita.length > 0) {
      this.citaAntigua = JSON.parse(JSON.stringify(modCita[0])); // Almacena la cita existente
      this.modificacionActiva = true;

      this.nombreServicio = this.citaAntigua.services[0]?._id.toString() || "";
      this.salonID = this.citaAntigua.centerInfo.toString();
      this.peluqueroNombre = await MongoDB.ObtenerNombrePeluqueroPorID(
        this.citaAntigua.userInfo
      );
      this.nombre = this.citaAntigua.clientName;
      this.fecha = this.citaAntigua.date;
      this.hora = this.citaAntigua.initTime;

      rtn.message = `Esta es la cita que el cliente desea modificar: ${JSON.stringify(
        this.citaAntigua,
        null,
        2
      )}. ¿Qué desea cambiar de la cita?`;
    } else {
      rtn.message = `La cita del cliente para la fecha ${fecha} no ha sido encontrada en el sistema.`;
    }

    DoLog(rtn.message);
    this.AddMsg(rtn);
    return "";
  }

  async ProcesarInfoCentro(gpt) {
    // Extraer el nombre del centro desde el comando
    const partes = gpt.split(" ");
    const nombreCentro = partes.slice(1).join(" ").trim(); // Guardar nombre en variable centro
    let centroID = "";

    //console.log("nombreCentro:", nombreCentro);

    let rtn = new Message(WhoEnum.System);

    try {
      // Obtener el ID del centro utilizando CalculaCentroID con el nombre
      centroID = await ChatGPT.CalculaCentroID(nombreCentro);

      //console.log("centroID:", centroID);

      if (centroID) {
        // Buscar la información del centro en la lista de salones usando el centroID
        const centroInfo = salones.find((salon) => salon.salonID === centroID);

        if (centroInfo) {
          //console.log("centroInfo:", centroInfo);
          // Formatear la información del centro
          rtn.message = `Información del Centro:\n*Nombre:* ${centroInfo.nombre}\n*Dirección:* ${centroInfo.address}\n*Teléfono:* ${centroInfo.phoneNumber}`;
        } else {
          rtn.message = `No se encontró información para el centro con nombre "${nombreCentro}".`;
        }
      } else {
        rtn.message = `No se pudo identificar el centro con el nombre "${nombreCentro}".`;
      }
    } catch (ex) {
      try {
        const rtn = await ErrorHandler.handleCommandError(gpt.message, error, this);
        return rtn;
    } catch (correctionError) {
        // Si falla la corrección, registrar el error y continuar con el manejo normal de errores
        DoLog(`Error en la corrección del comando: ${correctionError}`, Log.Error);
        throw error; // Relanzar el error original si la corrección falla
    }
      DoLog(`Error al obtener la información del centro: ${ex}`, Log.Error);
      await LogError(
        cthis.from,
        `Error al procesar la solicitud de información del centro`,
        ex,
        this.salonID,
        this.salonNombre
      );
      rtn.message =
        "Hubo un error al obtener la información del centro. Por favor, intente nuevamente más tarde.";
    }

    DoLog(rtn.message);
    this.AddMsg(rtn);
    return "";
  }

  async ProcesarConsultarHorario(gpt) {
    console.log("\n=== INICIO PROCESAR CONSULTAR HORARIO ===");
    
    const partes = gpt.replace("CONSULTHOR", "").trim().split(/\s+/);
    const fecha = partes[0];
    const nombrePeluquero = partes[1] === "MOREINFO" ? "" : partes.slice(1).join(" ");

    console.log("Parámetros recibidos:", {
        fecha,
        nombrePeluquero: nombrePeluquero || "MOREINFO",
        salonID: this.salonID
    });

    let rtn = new Message(WhoEnum.System);

    try {
        // 1. Validaciones iniciales
        if (!moment(fecha, moment.ISO_8601, true).isValid()) {
            console.log("Error: Fecha inválida");
            throw new Error("Fecha proporcionada no válida");
        }

        if (!this.salonID) {
            console.log("Error: Salón no especificado");
            rtn.message = "Por favor, indica primero en qué salón quieres consultar la disponibilidad.";
            this.AddMsg(rtn);
            return "";
        }

        // 2. Preparar fecha y validar día de la semana
        const fechaConsulta = moment(fecha).tz("Europe/Madrid");
        const diaSemana = fechaConsulta.day();
        const esHorarioCierre = fechaConsulta.format("HH:mm") === "22:00";

        console.log("Fecha procesada:", {
            fecha: fechaConsulta.format(),
            diaSemana,
            esHorarioCierre
        });

        // 3. Manejar MOREINFO (consulta general)
        if (nombrePeluquero.toUpperCase().includes("MOREINFO")) {
            console.log("Procesando consulta general (MOREINFO)");
            
            const peluquerosDelSalon = peluqueros.filter(p => p.salonID === this.salonID);
            console.log(`Encontrados ${peluquerosDelSalon.length} peluqueros en el salón`);

            // Obtener disponibilidad de todos los peluqueros
            const horariosPromises = peluquerosDelSalon.map(async peluquero => {
                try {
                    const citasFueraHorario = await Appointments.find({
                        date: fechaConsulta.format("MM/DD/YYYY"),
                        userInfo: new mongoose.Types.ObjectId(peluquero.peluqueroID),
                        centerInfo: new mongoose.Types.ObjectId(this.salonID),
                        clientName: "Fuera de horario",
                        status: "confirmed"
                    }).lean();

                    if (citasFueraHorario.length === 0) {
                        return {
                            nombre: peluquero.name,
                            horario: "10:00 a 22:00"
                        };
                    }

                    // Procesar horarios disponibles según citas fuera de horario
                    const horarios = citasFueraHorario.reduce((acc, cita) => {
                        const inicio = cita.initTime === "10:00" ? 
                            moment(cita.finalTime, "HH:mm").format("HH:mm") : "10:00";
                        const fin = cita.finalTime === "22:00" ? 
                            moment(cita.initTime, "HH:mm").format("HH:mm") : "22:00";
                        return `${inicio} a ${fin}`;
                    }, "");

                    return {
                        nombre: peluquero.name,
                        horario
                    };
                } catch (error) {
                    console.error(`Error consultando horarios de ${peluquero.name}:`, error);
                    return null;
                }
            });

            const resultados = (await Promise.all(horariosPromises))
                .filter(resultado => resultado !== null);

            if (resultados.length > 0) {
                const horariosList = resultados
                    .map(r => `*${r.nombre}*: de ${r.horario}`)
                    .join("\n");
                
                rtn.message = `Horarios de los peluqueros para el ${fechaConsulta.format("DD/MM/YYYY")}:\n\n${horariosList}\n\n¿Te gustaría agendar una cita con alguno de ellos?`;
            } else {
                rtn.message = `Lo siento, no hay peluqueros registrados para trabajar el ${fechaConsulta.format("DD/MM/YYYY")}.`;
            }
        }
        // 4. Manejar consulta de peluquero específico
        else {
            console.log("Procesando consulta para peluquero específico:", nombrePeluquero);
            
            const peluqueroID = await ChatGPT.CalculaPeluquero(nombrePeluquero, this.salonID);
            if (!peluqueroID) {
                rtn.message = `No se encontró al peluquero "${nombrePeluquero}" en este salón.`;
                this.AddMsg(rtn);
                return "";
            }

            // Buscar horarios disponibles para los próximos 7 días
            let horariosEncontrados = false;
            let horariosDisponibles = [];
            const fechaActual = fechaConsulta.clone();

            for (let i = 0; i <= 7; i++) {
                console.log(`Buscando horarios para el día ${fechaActual.format("DD/MM/YYYY")}`);

                const citasFueraHorario = await Appointments.find({
                    date: fechaActual.format("MM/DD/YYYY"),
                    userInfo: new mongoose.Types.ObjectId(peluqueroID),
                    centerInfo: new mongoose.Types.ObjectId(this.salonID),
                    clientName: "Fuera de horario",
                    status: "confirmed"
                }).lean();

                if (citasFueraHorario.length === 0 && i === 0) {
                    rtn.message = `${nombrePeluquero} trabaja de 10:00 a 22:00 el ${fechaActual.format("DD/MM/YYYY")}. ¿Te gustaría agendar una cita?`;
                    horariosEncontrados = true;
                    break;
                } else if (citasFueraHorario.length > 0) {
                    const horariosDia = citasFueraHorario.reduce((acc, cita) => {
                        const horario = {
                            fecha: fechaActual.format("DD/MM/YYYY"),
                            inicio: cita.initTime === "10:00" ? 
                                moment(cita.finalTime, "HH:mm").format("HH:mm") : "10:00",
                            fin: cita.finalTime === "22:00" ? 
                                moment(cita.initTime, "HH:mm").format("HH:mm") : "22:00"
                        };
                        acc.push(horario);
                        return acc;
                    }, []);

                    horariosDisponibles.push(...horariosDia);
                }

                fechaActual.add(1, 'days');
            }

            if (!horariosEncontrados && horariosDisponibles.length > 0) {
                const horariosMsg = horariosDisponibles
                    .map(h => `*${h.fecha}*: de ${h.inicio} a ${h.fin}`)
                    .join("\n");

                rtn.message = `${nombrePeluquero} tiene los siguientes horarios disponibles:\n\n${horariosMsg}\n\n¿Te gustaría agendar una cita en alguno de estos horarios?`;
            } else if (!horariosEncontrados) {
                rtn.message = `${nombrePeluquero} no tiene horarios registrados en los próximos 7 días.`;
            }
        }

        console.log("Mensaje final:", rtn.message);

    } catch (error) {
      try {
        const rtn = await ErrorHandler.handleCommandError(gpt.message, error, this);
        return rtn;
    } catch (correctionError) {
        // Si falla la corrección, registrar el error y continuar con el manejo normal de errores
        DoLog(`Error en la corrección del comando: ${correctionError}`, Log.Error);
        throw error; // Relanzar el error original si la corrección falla
    }
        console.error("Error en ProcesarConsultarHorario:", error);
        rtn.message = "Lo siento, ha ocurrido un error al consultar los horarios. ¿Podrías intentarlo de nuevo?";
        await LogError(
            this.from,
            "Error al procesar consulta de horario",
            error,
            this.salonID,
            this.salonNombre
        );
    }

    console.log("=== FIN PROCESAR CONSULTAR HORARIO ===\n");
    
    this.AddMsg(rtn);
    return "";
}
  
  async ProcesarFlow(gpt) {
    let rtn = new Message(WhoEnum.System);
    
    try {
        // Datos para la plantilla del flow
        const data = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: this.from,
            type: "template",
            template: {
                name: "crearcita", // Nombre de tu plantilla
                language: {
                    code: "es"
                },
                components: [
                    {
                        type: "button",
                        sub_type: "flow",
                        index: "0",
                        parameters: [
                            {
                                type: "action",
                                payload: "FLOW_START",
                                action: {
                                    flow_action_data: {
                                        flow_id: "1096594351725070", // ID de tu flow
                                        navigate_screen: "SERVICE_AND_LOCATION" // Pantalla inicial
                                    }
                                }
                            }
                        ]
                    }
                ]
            }
        };

        // Enviar la plantilla usando la función Send existente
        await WhatsApp.Send(_phone_number_id, data);
        
        rtn.message = "Flow de cita iniciado correctamente.";
        
        // Incrementar el contador de interacciones
        await statisticsManager.incrementInteractions();
        
    } catch (error) {
        console.error('Error al procesar el flow:', error);
        rtn.message = "Hubo un error al iniciar el flow de cita.";
        await statisticsManager.incrementFailedOperations();
        await LogError(
          this.from,
            'Error al procesar flow de cita',
            error,
            this.salonID,
            this.salonNombre
        );
    }

    this.AddMsg(rtn);
    return "";
  }
}

class Message {
  constructor(who = WhoEnum.None) {
    this.type = "";
    this.msg_id = "";
    this.newID = false;
    this.audio = false;
    this.message = "";
    this.rawMsg = "";
    this.GPT = GPTEnum.NONE;
    this.who = who;
  }

  InitFromReq(req) {
    let value = req?.body?.entry?.[0]?.changes[0]?.value ?? null;
    let msg_obj = value?.messages?.[0] ?? null;
    this.InitFromMsgObj(msg_obj);
  }

  InitFromMsgObj(msg_obj) {
    this.type = msg_obj?.type ?? "";
    this.msg_id = msg_obj?.id ?? "";
    this.audio = msg_obj?.audio ?? false;
    this.message = msg_obj?.text?.body?.trim() ?? "";
    if (this.type == "button") {
      this.message = msg_obj?.button?.text?.trim() ?? "";
      DoLog(`Boton "${this.message}" pulsado.`, Log.Log);
    }
    this.message = this.message
      .replace("[", "(")
      .replace("]", ")")
      .replace("~", "-");
  }

  Init(message, msg_id = "") {
    this.msg_id = msg_id ?? "";
    this.message = message ?? "";
  }

  SetGPT() {
    this.GPT = GPTEnum.NONE;
    for (const [key, value] of Object.entries(GPTEnum)) {
      if (key != "NONE") {
        if (this.message.includes(value)) {
          this.GPT = value;
          break;
        }
      }
    }
    return this.GPT;
  }
}

class MongoDB {
  static async ObtenerSalonPorSalonID(salonID) {
    let rtn = null;
    if (salonID) {
      let salon = salones.find((salon) => salon.salonID == salonID.toString());
      rtn = salon ?? null;
    }
    return rtn ?? { salonID: "", nombre: "", address: "" };
  }

  static EsMixto(salonID) {
    let rtn = false;
    let isXX = false;
    let isXY = false;
    for (let salon of salones) {
      if (salon.salonID == salonID) {
        for (let especialidadID of salon.specialities) {
          let name = MongoDB.GetEspecialidadName(especialidadID);
          if (name.toUpperCase() == "SEÑORA") {
            isXX = true;
          } else if (name.toUpperCase() == "CABALLERO") {
            isXY = true;
          }
        }
      }
    }
    rtn = isXX && isXY;
    return rtn;
  }

  static GetEspecialidadName(especialidadID) {
    let rtn = "";
    for (let especialidad of especialidades) {
      if (especialidad.especialidadID == especialidadID) {
        rtn = especialidad.name;
        return rtn;
      }
    }
    return rtn;
  }

  static PeluqueroTieneServicio(peluquero, serviciosSolicitados) {
    //console.log(`Revisando servicios del peluquero: ${peluquero.name}`);
    //console.log(`Servicios del peluquero: ${JSON.stringify(peluquero.services)}`);
    //console.log(`Servicios solicitados: ${JSON.stringify(serviciosSolicitados)}`);

    // Asegúrate de que serviciosSolicitados es un array
    serviciosSolicitados = Array.isArray(serviciosSolicitados)
      ? serviciosSolicitados
      : [serviciosSolicitados];

    // Convertimos los servicios del peluquero a sus IDs
    let serviciosDelPeluqueroIDs = peluquero.services
      .map((servicio) => {
        let servicioInfo = servicios.find((s) => s.servicio === servicio);
        return servicioInfo ? servicioInfo.servicioID : null;
      })
      .filter((id) => id !== null);

    //console.log(`IDs de servicios del peluquero: ${JSON.stringify(serviciosDelPeluqueroIDs)}`);

    // Verificamos si el peluquero tiene todos los servicios solicitados
    let tieneServicio = serviciosSolicitados.every((servicioID) => {
      //console.log(`Comparando servicio solicitado: ${servicioID}`);

      let resultado = serviciosDelPeluqueroIDs.includes(servicioID);
      //console.log(`Resultado de la comparación para ${peluquero.name}: ${resultado}`);
      return resultado;
    });

    //console.log(`El peluquero ${peluquero.name} tiene todos los servicios solicitados: ${tieneServicio}`);
    return tieneServicio;
  }

  static PeluqueroTieneEspecialidad(peluquero, especialidadID) {
    let rtn = false;
    //console.log("entra en PeluqueroTieneEspecialidad");
    //console.log("peluquero.specialties", peluquero.specialties);
    if (especialidadID == "") {
      rtn = true;
    } else {
      for (let especialidad of peluquero.specialities) {
        //console.log("especialidad:", especialidad)
        if (especialidad == especialidadID) {
          rtn = true;
          return rtn;
        }
      }
    }
    return rtn;
  }

  static async ListarPeluquerosDisponibles(fecha, salonID, nombreServicio, especialidadID, duracionServicio) {
    let rtn = [];
    console.log("\n=== INICIO LISTAR PELUQUEROS DISPONIBLES ===");
    console.log("Parámetros recibidos:", {
        fecha: fecha.format(),
        salonID,
        nombreServicio,
        especialidadID,
        duracionServicio
    });

    try {
        // 1. Validar formato de fecha
        if (!moment(fecha).isValid()) {
            console.log("Error: Fecha inválida");
            throw new Error("Fecha inválida");
        }

        // 2. Obtener y validar la hora
        const hora = fecha.format("HH:mm");
        const horarioApertura = "10:00";
        const horarioCierre = "22:00";

        console.log("Validación de horario:", {
            horasolicitada: hora,
            apertura: horarioApertura,
            cierre: horarioCierre
        });

        if (hora < horarioApertura || hora > horarioCierre) {
            console.log("Error: Hora fuera de horario comercial");
            throw new Error("Hora fuera de horario comercial");
        }

        // 3. Convertir servicios a array si no lo es
        const serviciosSolicitados = Array.isArray(nombreServicio) ? 
            nombreServicio : [nombreServicio];
        
        console.log("Servicios solicitados:", serviciosSolicitados);

        // 4. Filtrar peluqueros del salón
        const peluquerosSalon = peluqueros.filter(p => p.salonID === salonID);
        console.log(`Encontrados ${peluquerosSalon.length} peluqueros en el salón`);

        // 5. Verificar cada peluquero
        for (const peluquero of peluquerosSalon) {
            console.log(`\nVerificando peluquero: ${peluquero.name}`);

            // 5.1 Verificar servicios
            const tieneServicio = this.PeluqueroTieneServicio(peluquero, serviciosSolicitados);
            console.log(`Tiene servicios requeridos: ${tieneServicio}`);

            // 5.2 Verificar especialidad
            const tieneEspecialidad = this.PeluqueroTieneEspecialidad(peluquero, especialidadID);
            console.log(`Tiene especialidad requerida: ${tieneEspecialidad}`);

            if (tieneServicio && tieneEspecialidad) {
                // 5.3 Verificar disponibilidad
                const disponibilidad = await this.VerificarDisponibilidadPeluquero(
                    peluquero.peluqueroID,
                    fecha,
                    salonID,
                    duracionServicio
                );
                console.log(`Disponibilidad: ${JSON.stringify(disponibilidad)}`);

                if (disponibilidad.disponible) {
                    console.log(`Peluquero ${peluquero.name} está disponible`);
                    rtn.push(peluquero.peluqueroID);
                }
            }
        }

        console.log(`\nPeluqueros disponibles encontrados: ${rtn.length}`);
        console.log("IDs:", rtn);

    } catch (error) {
        console.error("Error en ListarPeluquerosDisponibles:", error);
        console.error("Stack:", error.stack);
        throw error;
    }

    console.log("=== FIN LISTAR PELUQUEROS DISPONIBLES ===\n");
    return rtn;
}

static async VerificarDisponibilidadPeluquero(peluqueroID, fecha, salonID, duracionServicio) {
  console.log("\n=== INICIO VERIFICAR DISPONIBILIDAD ===");
  console.log("Parámetros:", {
      peluqueroID,
      fecha: fecha.format(),
      salonID,
      duracionServicio
  });

  let rtn = {
      disponible: false,
      horaEntrada: null,
      horaSalida: null,
      horariosDisponibles: null
  };

  try {
      // 1. Formatear fechas
      const fechaConsulta = moment(fecha);
      const fechaFormato = fechaConsulta.format("MM/DD/YYYY");
      const horaInicio = fechaConsulta.format("HH:mm");
      
      console.log("Fechas procesadas:", {
          fechaFormato,
          horaInicio,
          timezone: fechaConsulta.tz()
      });

      // 2. Calcular hora de finalización
      const horaFinServicio = fechaConsulta
          .clone()
          .add(duracionServicio, 'minutes')
          .format("HH:mm");

      console.log("Horas de servicio:", {
          inicio: horaInicio,
          fin: horaFinServicio,
          duracion: duracionServicio
      });

      // 3. Preparar la consulta con validación de ObjectId
      let query = {
          date: fechaFormato,
          status: "confirmed"
      };

      // Validar y agregar userInfo solo si peluqueroID es válido
      if (mongoose.Types.ObjectId.isValid(peluqueroID)) {
          query.userInfo = peluqueroID;
      } else {
          console.log("ID de peluquero no válido:", peluqueroID);
          throw new Error("ID de peluquero no válido");
      }

      // Validar y agregar centerInfo solo si salonID es válido
      if (mongoose.Types.ObjectId.isValid(salonID)) {
          query.centerInfo = salonID;
      } else {
          console.log("ID de salón no válido:", salonID);
          throw new Error("ID de salón no válido");
      }

      console.log("Query preparada:", query);

      // 4. Buscar citas existentes
      const listaCitas = await Appointments.find(query).lean();

      console.log(`Se encontraron ${listaCitas.length} citas existentes`);

      // 5. Verificar solapamientos
      const momentHoraInicio = moment(horaInicio, "HH:mm");
      const momentHoraFin = moment(horaFinServicio, "HH:mm");

      let hayConflicto = false;
      for (const cita of listaCitas) {
          // Ignorar citas canceladas
          if (cita.status === "canceled") continue;

          const citaInicio = moment(cita.initTime, "HH:mm");
          const citaFin = moment(cita.finalTime, "HH:mm");

          console.log(`Verificando solapamiento con cita:`, {
              citaInicio: cita.initTime,
              citaFin: cita.finalTime,
              status: cita.status
          });

          // Verificar si hay solapamiento
          if (momentHoraInicio.isBefore(citaFin) && momentHoraFin.isAfter(citaInicio)) {
              console.log("¡Se detectó solapamiento!");
              hayConflicto = true;
              break;
          }
      }

      // 6. Verificar horario laboral
      const horarioApertura = moment("10:00", "HH:mm");
      const horarioCierre = moment("22:00", "HH:mm");

      const estaEnHorarioLaboral = momentHoraInicio.isSameOrAfter(horarioApertura) && 
                                 momentHoraFin.isSameOrBefore(horarioCierre);

      console.log("Verificación de horario laboral:", {
          estaEnHorarioLaboral,
          inicioServicio: momentHoraInicio.format("HH:mm"),
          finServicio: momentHoraFin.format("HH:mm")
      });

      // 7. Buscar citas fuera de horario con query optimizada
      query.clientName = "Fuera de horario";
      const citasFueraHorario = await Appointments.find(query).lean();

      let hayFueraHorario = false;
      for (const cita of citasFueraHorario) {
          const citaInicio = moment(cita.initTime, "HH:mm");
          const citaFin = moment(cita.finalTime, "HH:mm");
          
          if (momentHoraInicio.isBefore(citaFin) && momentHoraFin.isAfter(citaInicio)) {
              console.log("¡Se detectó periodo fuera de horario!");
              hayFueraHorario = true;
              break;
          }
      }

      // 8. Determinar disponibilidad final
      rtn.disponible = !hayConflicto && estaEnHorarioLaboral && !hayFueraHorario;
      rtn.horaEntrada = horaInicio;
      rtn.horaSalida = horaFinServicio;

      console.log("Resultado final:", {
          disponible: rtn.disponible,
          horaEntrada: rtn.horaEntrada,
          horaSalida: rtn.horaSalida,
          razon: !rtn.disponible ? 
                 (hayConflicto ? "Conflicto con cita existente" : 
                  !estaEnHorarioLaboral ? "Fuera de horario laboral" : 
                  "Periodo marcado como no disponible") : "Disponible"
      });

  } catch (error) {
      console.error("Error en VerificarDisponibilidadPeluquero:", error);
      console.error("Stack:", error.stack);
      throw error;
  }

  console.log("=== FIN VERIFICAR DISPONIBILIDAD ===\n");
  return rtn;
}

  static async ObtenerNombresPeluquerosPorIDs(idsPeluquero) {
    let rtn = [];
    try {
      let promesasNombres = idsPeluquero.map((idPeluquero) =>
        MongoDB.ObtenerNombrePeluqueroPorID(idPeluquero)
      );
      let nombresPeluqueros = await Promise.all(promesasNombres);
      rtn = nombresPeluqueros.filter((nombre) => nombre != null);
    } catch (ex) {
      DoLog(`Error al obtener los nombres de los peluqueros: ${ex}`, Log.Error);
    }
    return rtn;
  }

  static async ObtenerNombrePeluqueroPorID(peluqueroID) {
    try {
      for (let peluquero of peluqueros) {
        if (peluquero.peluqueroID == peluqueroID) {
          return peluquero.name;
        }
      }
    } catch (ex) {
      DoLog(`Error al leer el archivo de peluqueros: ${ex}`, Log.Error);
    }
    return null;
  }

  static async MarcarPeluqueroComoNoDisponible(id, dia) {
    let rtn = { success: false, message: "" };
    let fechaISO = moment(dia);
    let fecha = fechaISO.format("DD/MM/YYYY");
    let inicioCita = "00:00";
    let finCita = "23:59";
    const evento = new Appointments({
      clientName: "BAJA",
      clientPhone: "",
      fecha: fecha,
      horaInicio: inicioCita,
      horaFin: finCita,
      userInto: new ObjectId(id),
    });
    try {
      await evento.save();
      rtn.success = true;
      rtn.message = `Peluquero ${id} marcado como no disponible para ${dia}.`;
    } catch (ex) {
      DoLog(`Error al guardar el evento en MongoDB:${ex}`, Log.Error);
      rtn.success = false;
      rtn.message = "Error al procesar la solicitud. Inténtalo de nuevo.";
    }
    return rtn;
  }

  static async MarcarPeluqueroComida(id, inicioComida, finComida) {
    let rtn = { success: false, message: "" };
    let fechaISO = moment(inicioComida);
    let fecha = fechaISO.format("DD/MM/YYYY");
    let inicioCita = fechaISO.tz("Europe/Madrid").format("HH:mm");
    let fin = moment(finComida);
    let finCita = fin.tz("Europe/Madrid").format("HH:mm");
    const evento = new Appointments({
      clientName: "Hora de Comida",
      clientPhone: "",
      fecha: fecha,
      horaInicio: inicioCita,
      horaFin: finCita,
      userInto: new ObjectId(id),
      services: ["Hora de Comida"],
    });
    try {
      await evento.save();
      rtn.success = true;
      rtn.message = `Peluquero ${id} reservada comida para ${fecha}.`;
    } catch (ex) {
      DoLog(`Error al guardar el evento en MongoDB:${ex}`, Log.Error);
      rtn.success = false;
      rtn.message = "Error al procesar la solicitud. Inténtalo de nuevo.";
    }
    return rtn;
  }

  static async BuscarCitasDePeluquero(id, dia) {
    let fechaEvento = moment(dia).format("DD/MM/YYYY");
    let rtn = [];
    try {
      rtn = await Appointments.find({
        userInfo: ObjectId(id),
        date: fechaEvento,
        status: "confirmed", // Filtrar solo citas confirmadas
      });
    } catch (ex) {
      DoLog(`Error al buscar citas del peluquero: ${ex}`, Log.Error);
      await LogError(
        this.from,
        `Error al buscar citas del peluquero`,
        ex,
        this.salonID,
        this.salonNombre
      );
      await statisticsManager.incrementFailedOperations();
      rtn = [];
    }
    return rtn;
  }

  static async BorrarCitas(from, fecha) {
    let rtn = false;
    console.log("entra en BorrarCitas()");
    try {
      // Buscar todas las reservas que coincidan con la fecha y el número de teléfono
      let citas = await Appointments.find({
        date: fecha,
        clientPhone: from,
      });
      console.log("citas encontradas:", citas);

      if (citas.length > 0) {
        // Actualizar el status de todas las citas a "canceled"
        await Appointments.updateMany(
          { date: fecha, clientPhone: from },
          { $set: { status: "canceled" } }
        );
        rtn = true;
        await statisticsManager.incrementCanceledAppointments(citas.length);
        console.log(`${citas.length} citas se han marcado como canceladas`);
      } else {
        rtn = false;
        console.log("No se encontraron citas para cancelar");
      }
    } catch (ex) {
      DoLog(`Error al borrar las citas en MongoDB:${ex}`, Log.Error);
      await LogError(
        from,
        `Error al borrar las citas`,
        ex,
        this.salonID,
        this.salonNombre
      );
      await statisticsManager.incrementFailedOperations();
      rtn = false;
    }
    return rtn;
  }

  static async GuardarEventoEnBD(curr, horaInicio, horaFin) {
    let rtn = false;
    let fechaISO = moment(horaInicio);
    let fecha = fechaISO.format("MM/DD/YYYY");
    let inicioCita = fechaISO.tz("Europe/Madrid").format("HH:mm");
    let fin = moment(horaFin);
    let finCita = fin.tz("Europe/Madrid").format("HH:mm");
    try {
      let serviciosParaGuardar = [];

      // Separar el string curr.servicioID en los diferentes IDs utilizando comas
      let ids = curr.servicioID.split(",").map((id) => id.trim());

      for (let servicioID of ids) {
        // Encontrar el servicio correspondiente en la lista de servicios
        let servicio = servicios.find((s) => s.servicioID === servicioID);
        if (servicio) {
          serviciosParaGuardar.push({
            _id: new ObjectId(servicio.servicioID), // Asegurar conversión a ObjectId
            serviceName: servicio.servicio,
            duration: servicio.duracion,
            color: servicio.color,
          });
        }
      }

      if (serviciosParaGuardar.length === 0) {
        throw new Error("No se encontraron servicios válidos para guardar.");
      }

      /*
      console.log("curr.nombre:", curr.nombre);
      console.log("curr.from:", curr.from);
      console.log("fecha:", fecha);
      console.log("inicioCita:", inicioCita);
      console.log("finCita:", finCita);
      console.log("curr.peluquero:", curr.peluquero);
      console.log("curr.peluquero.peluqueroID:", curr.peluquero.peluqueroID);
      console.log("curr.salonID:", curr.salonID);
      console.log("serviciosParaGuardar:", serviciosParaGuardar);
      */

      const evento = new Appointments({
        clientName: curr.nombre,
        clientPhone: curr.from,
        date: fecha,
        initTime: inicioCita,
        finalTime: finCita,
        userInfo: new ObjectId(curr.peluquero.peluqueroID), // Asegurar conversión a ObjectId
        centerInfo: new ObjectId(curr.salonID), // Asegurar conversión a ObjectId
        services: serviciosParaGuardar, // Guardar todos los servicios encontrados
      });

      //console.log(evento);

      await evento.save();
      rtn = true;
    } catch (ex) {
      DoLog(`Error al guardar el evento en MongoDB:${ex}`, Log.Error);
      await LogError(
        curr.from,
        `Error al guardar evento`,
        ex,
        this.salonID,
        this.salonNombre
      );
      await statisticsManager.incrementFailedOperations();
      rtn = false;
    }
    return rtn;
  }

  static async BuscarHorariosDisponiblesPeluquero(peluqueroID, fecha, duracionServicio, salonID) {
    console.log("\n=== INICIO BUSCAR HORARIOS DISPONIBLES ===");
    console.log("Parámetros:", {
        peluqueroID,
        fecha: moment(fecha).format(),
        duracionServicio,
        salonID
    });

    const horariosDisponibles = [];
    
    try {
        // 1. Validar IDs
        if (!mongoose.Types.ObjectId.isValid(peluqueroID)) {
            console.log("ID de peluquero no válido:", peluqueroID);
            throw new Error("ID de peluquero no válido");
        }
        if (!mongoose.Types.ObjectId.isValid(salonID)) {
            console.log("ID de salón no válido:", salonID);
            throw new Error("ID de salón no válido");
        }

        // 2. Configurar horarios base
        const fechaConsulta = moment(fecha);
        const fechaFormato = fechaConsulta.format("MM/DD/YYYY");
        const horarioApertura = moment(fecha).set({ hour: 10, minute: 0 });
        const horarioCierre = moment(fecha).set({ hour: 22, minute: 0 });
        const intervalo = 30; // minutos entre cada slot

        console.log("Configuración de horarios:", {
            fecha: fechaFormato,
            apertura: horarioApertura.format("HH:mm"),
            cierre: horarioCierre.format("HH:mm"),
            intervaloMinutos: intervalo
        });

        // 3. Preparar query base
        const queryBase = {
            date: fechaFormato,
            status: "confirmed",
            userInfo: peluqueroID,
            centerInfo: salonID
        };

        // 4. Obtener citas normales y fuera de horario
        const [citasNormales, citasFueraHorario] = await Promise.all([
            Appointments.find({ 
                ...queryBase,
                clientName: { $ne: "Fuera de horario" }
            }).lean(),
            Appointments.find({
                ...queryBase,
                clientName: "Fuera de horario"
            }).lean()
        ]);

        console.log(`Citas encontradas: ${citasNormales.length} normales, ${citasFueraHorario.length} fuera de horario`);

        // 5. Crear mapa de slots ocupados
        const slotsOcupados = new Set();

        // Procesar citas normales
        citasNormales.forEach(cita => {
            const inicio = moment(cita.initTime, "HH:mm");
            const fin = moment(cita.finalTime, "HH:mm");
            
            // Marcar todos los slots dentro de la cita como ocupados
            let slot = inicio.clone();
            while (slot.isBefore(fin)) {
                slotsOcupados.add(slot.format("HH:mm"));
                slot.add(intervalo, 'minutes');
            }
        });

        // Procesar citas fuera de horario
        const periodosFueraHorario = citasFueraHorario.map(cita => ({
            inicio: moment(cita.initTime, "HH:mm"),
            fin: moment(cita.finalTime, "HH:mm")
        }));

        // 6. Generar slots disponibles
        let slotActual = horarioApertura.clone();
        
        while (slotActual.isBefore(horarioCierre)) {
            const horaSlot = slotActual.format("HH:mm");
            const finSlot = slotActual.clone().add(duracionServicio, 'minutes');

            // Verificar si el slot está disponible
            const slotDisponible = !slotsOcupados.has(horaSlot) && 
                                 finSlot.isSameOrBefore(horarioCierre) &&
                                 !periodosFueraHorario.some(periodo => 
                                     slotActual.isBefore(periodo.fin) && 
                                     finSlot.isAfter(periodo.inicio)
                                 );

            if (slotDisponible) {
                // Verificar si hay suficiente tiempo hasta la siguiente cita
                const siguienteCitaOcupada = Array.from(slotsOcupados)
                    .map(hora => moment(hora, "HH:mm"))
                    .filter(hora => hora.isAfter(slotActual))
                    .sort((a, b) => a.diff(b))[0];

                const hayEspacioSuficiente = !siguienteCitaOcupada || 
                    finSlot.isSameOrBefore(siguienteCitaOcupada);

                if (hayEspacioSuficiente) {
                    horariosDisponibles.push(horaSlot);
                }
            }

            slotActual.add(intervalo, 'minutes');
        }

        console.log("Horarios disponibles encontrados:", horariosDisponibles);

    } catch (error) {
        console.error("Error en BuscarHorariosDisponiblesPeluquero:", error);
        console.error("Stack:", error.stack);
        throw error;
    }

    console.log("=== FIN BUSCAR HORARIOS DISPONIBLES ===\n");
    return horariosDisponibles;
}

static async BuscarHorariosConPeluquerosDisponibles(fecha, salonID, nombreServicio, especialidadID, duracionServicio) {
  console.log("\n=== INICIO BUSCAR HORARIOS CON PELUQUEROS ===");
  console.log("Parámetros:", {
      fecha: moment(fecha).format(),
      salonID,
      nombreServicio,
      especialidadID,
      duracionServicio
  });

  let horariosDisponiblesConPeluquero = [];

  try {
      // 1. Validar IDs y parámetros
      if (!mongoose.Types.ObjectId.isValid(salonID)) {
          console.log("ID de salón no válido:", salonID);
          throw new Error("ID de salón no válido");
      }

      // 2. Obtener peluqueros del salón
      const peluquerosSalon = peluqueros.filter(p => p.salonID === salonID);
      console.log(`Encontrados ${peluquerosSalon.length} peluqueros en el salón`);

      // 3. Convertir servicios a array si no lo es
      const serviciosSolicitados = Array.isArray(nombreServicio) ? 
          nombreServicio : [nombreServicio];

      // 4. Filtrar peluqueros por servicio y especialidad
      const peluquerosCalificados = peluquerosSalon.filter(peluquero => {
          const tieneServicio = this.PeluqueroTieneServicio(peluquero, serviciosSolicitados);
          const tieneEspecialidad = this.PeluqueroTieneEspecialidad(peluquero, especialidadID);
          
          console.log(`Peluquero ${peluquero.name}:`, {
              tieneServicio,
              tieneEspecialidad
          });

          return tieneServicio && tieneEspecialidad;
      });

      console.log(`${peluquerosCalificados.length} peluqueros cumplen los requisitos`);

      // 5. Obtener horarios disponibles para cada peluquero calificado
      const horariosPromises = peluquerosCalificados.map(async peluquero => {
          try {
              const horarios = await this.BuscarHorariosDisponiblesPeluquero(
                  peluquero.peluqueroID,
                  fecha,
                  duracionServicio,
                  salonID
              );

              return horarios.map(hora => ({
                  hora,
                  peluqueroNombre: peluquero.name,
                  peluqueroID: peluquero.peluqueroID
              }));
          } catch (error) {
              console.error(`Error al buscar horarios para ${peluquero.name}:`, error);
              return [];
          }
      });

      // 6. Esperar todos los resultados
      const resultadosHorarios = await Promise.all(horariosPromises);
      
      // 7. Aplanar y ordenar resultados
      horariosDisponiblesConPeluquero = resultadosHorarios
          .flat()
          .sort((a, b) => {
              // Primero ordenar por hora
              const horaComp = moment(a.hora, "HH:mm").diff(moment(b.hora, "HH:mm"));
              if (horaComp !== 0) return horaComp;
              // Si las horas son iguales, ordenar por nombre de peluquero
              return a.peluqueroNombre.localeCompare(b.peluqueroNombre);
          });

      // 8. Agrupar por hora para mejor visualización
      const horariosAgrupados = horariosDisponiblesConPeluquero.reduce((acc, curr) => {
          const horaExistente = acc.find(h => h.hora === curr.hora);
          if (horaExistente) {
              horaExistente.peluqueros.push({
                  nombre: curr.peluqueroNombre,
                  id: curr.peluqueroID
              });
          } else {
              acc.push({
                  hora: curr.hora,
                  peluqueros: [{
                      nombre: curr.peluqueroNombre,
                      id: curr.peluqueroID
                  }]
              });
          }
          return acc;
      }, []);

      console.log("Resultados agrupados:", horariosAgrupados);
      console.log(`Total de slots disponibles: ${horariosDisponiblesConPeluquero.length}`);

  } catch (error) {
      console.error("Error en BuscarHorariosConPeluquerosDisponibles:", error);
      console.error("Stack:", error.stack);
      throw error;
  }

  console.log("=== FIN BUSCAR HORARIOS CON PELUQUEROS ===\n");
  return horariosDisponiblesConPeluquero;
}

  static async BuscarDisponibilidadSiguienteSemana(
    peluqueroID,
    salonID,
    nombreServicio,
    especialidadID,
    duracionServicio,
    fechaInicio,
    diasMaximos = 7
  ) {
    const diasDisponibles = [];
    const fechaBase = moment(fechaInicio, "YYYY-MM-DD");

    try {
      for (let i = 1; i <= diasMaximos; i++) {
        const fecha = fechaBase.clone().add(i, "days");
        const horariosDisponibles =
          await MongoDB.BuscarHorariosDisponiblesPeluquero(
            peluqueroID,
            fecha,
            duracionServicio,
            salonID
          );

        console.log("horariosDisponibles:", horariosDisponibles);
        if (horariosDisponibles.length > 0) {
          diasDisponibles.push({
            dia: fecha.format("DD/MM/YYYY"),
            horarios: horariosDisponibles,
          });
        }
      }
    } catch (ex) {
      DoLog(
        `Error al buscar días con disponibilidad en los próximos días: ${ex}`,
        Log.Error
      );
      throw ex;
    }

    return diasDisponibles;
  }
}

class WhatsApp {
  // Método para seleccionar una encuesta aleatoriamente
  static seleccionarEncuestaAleatoria() {
    const indiceAleatorio = Math.floor(Math.random() * ENCUESTAS.length);
    return ENCUESTAS[indiceAleatorio];
  }

  static async Responder(phone_number_id, from, body, msg_id = null) {
    if (from ?? "" != "") {
      let data = {
        messaging_product: "whatsapp",
        to: from,
        text: { body: body },
      };
      if (msg_id ?? "" != "") {
        data.context = {
          message_id: msg_id,
        };
      }
      await WhatsApp.Send(phone_number_id, data);
    }
  }

  static async MarkRead(phone_number_id, ids) {
    for (let i = 0; i < ids.length; ++i) {
      let data = {
        messaging_product: "whatsapp",
        status: "read",
        message_id: ids[i],
      };
      await WhatsApp.Send(phone_number_id, data);
    }
  }

  static async Send(phone_number_id, data) {
    for (let i = 1; i <= 3; ++i) {
      try {
        if (phone_number_id ?? "" != "") {
          const response = await axios({
            method: "POST",
            url: `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
            headers: {
              Authorization: `Bearer ${GRAPH_API_TOKEN}`,
            },
            data: data,
          });
          //console.log('Respuesta exitosa de WhatsApp:', response.data);
        }
        return;
      } catch (error) {
        if (error.response) {
          console.error("Error en la respuesta del servidor:", {
            status: error.response.status,
            data: error.response.data,
            headers: error.response.headers,
          });
        } else if (error.request) {
          console.error("No hubo respuesta de WhatsApp:", error.request);
        } else {
          console.error("Error al configurar la solicitud:", error.message);
        }
        DoLog(
          `Error al enviar datos por WhatsApp intenti ${i}: ${error}`,
          Log.Error
        );
      }
      sleep(100);
    }
  }

  static async NotificarClientesSobreCambioDeCita(
    phone_number_id,
    from,
    citas
  ) {
    for (const cita of citas) {
      let cliente = cita.nombreCliente.substring(22).trim();
      WhatsApp.SendTemplateBaja(phone_number_id, from, cliente, cita.fecha);
    }
  }

  static async SendTemplateBaja(phone_number_id, from, cliente, fecha) {
    let data = {
      messaging_product: "whatsapp",
      to: from,
      type: "template",
      template: {
        name: "baja",
        language: {
          code: "es",
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: cliente,
              },
              {
                type: "text",
                text: fecha,
              },
            ],
          },
        ],
      },
    };
    await WhatsApp.Send(phone_number_id, data);
  }

  static async SendButton(phone_number_id, from) {
    let data = {
      messaging_product: "whatsapp",
      to: from,
      type: "template",
      template: {
        name: "hi",
        language: {
          code: "es",
        },
        components: [
          {
            type: "body",
          },
        ],
      },
    };
    await WhatsApp.Send(phone_number_id, data);
  }

  static async SendTemplateRecordatorio(
    phone_number_id,
    from,
    clientName,
    dia,
    hora
  ) {
    let data = {
      messaging_product: "whatsapp",
      to: from,
      type: "template",
      template: {
        name: "recordatorio_cita",
        language: {
          code: "es",
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: clientName,
              },
              {
                type: "text",
                text: dia,
              },
              {
                type: "text",
                text: hora,
              },
            ],
          },
        ],
      },
    };

    /*
    
 components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: clientName,
              },
              {
                type: "text",
                text: salonName,
              },
              {
                type: "text",
                text: serviceName,
              },
            ],
          },
        ],    
    
    
    */

    await WhatsApp.Send(phone_number_id, data);

    // Incrementar el contador de plantillas de recordatorio enviadas
    const today = moment().startOf("day").toDate();
    await statisticsManager.incrementReminderTemplatesSent();
  }

  static async enviarEncuesta(phone_number_id, from) {
    const encuestaSeleccionada = WhatsApp.seleccionarEncuestaAleatoria();

    const data = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: from,
      type: "template",
      template: {
        name: encuestaSeleccionada.name,
        language: {
          code: "es",
        },
        components: [
          {
            type: "button",
            sub_type: "flow",
            index: "0",
            parameters: [
              {
                type: "action",
                action: {
                  flow_action_data: {
                    flow_id: encuestaSeleccionada.flow_id,
                    navigate_screen: encuestaSeleccionada.navigate_screen,
                  },
                },
              },
            ],
          },
        ],
      },
    };

    await WhatsApp.Send(phone_number_id, data);
    console.log(
      `Encuesta ${encuestaSeleccionada.name} enviada al cliente con pantalla ${encuestaSeleccionada.navigate_screen}.`
    );
  }
}

class ChatGPT {
  static GetCurrentDateTime() {
    let rtn = "";
    let now = new Date();
    let day = now.toLocaleString("es-ES", { weekday: "long" });
    let date = now.getDate();
    let month = now.toLocaleString("es-ES", { month: "long" });
    let year = now.getFullYear();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    rtn = `Hoy es ${day} ${date} de ${month} de ${year}, son las ${hours}:${
      minutes < 10 ? "0" + minutes : minutes
    }.`;
    return rtn;
  }

  static async SendToGPT(txt, identity = true, role = "user") {
    let rtn = "";
    for (let i = 1; i <= 3; ++i) {
      try {
        let messages = [];
        let fecha = ChatGPT.GetCurrentDateTime();
        //console.log("fechaGPT:",fecha);
        if (identity) {
          messages.push({ role: "system", content: IDENTITY_CONTEXT });
        }
        messages.push({ role: "system", content: `Fecha actual: ${fecha}` });
        messages.push({ role: role, content: txt });
        // gpt-4-turbo-preview
        // gpt-4-turbo
        // gpt-4o
        // gpt-4o-mini
        // gpt-3.5-turbo
        // o1-mini
        let response = await axios.post(
          OPENAI_API_URL,
          {
            model: "gpt-4-turbo-preview",
            messages: messages,
            max_tokens: 400,
            temperature: 0,
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );
        rtn = response?.data?.choices?.[0]?.message?.content?.trim() ?? "";
        if (rtn != "") {
          break;
        }
      } catch (ex) {
        DoLog(
          `Error al enviar datos a GPT-4 Turbo intento ${i}: ${ex}`,
          Log.Error
        );
      }
      sleep(100);
    }
    return rtn;
  }

  static async IdComida(txt) {
    let rtn = "";

    try {
      let msg = ` ${txt} Un peluquero ha proporcionado su id y la hora a la que quiere solicitar su comida. No utlices para la respuesta ningun comando, solo devuelve el id y la fecha y hora solicitada en formato ISO 8601 con zona horaria de Madrid (Europa). el formato de tu respuesta solo deberia ser asi, sin la palabra 'HORACOMIDA': "id fechayhora"`;
      let response = await ChatGPT.SendToGPT(msg, true, "assistant");
      rtn = response?.data?.choices?.[0]?.message?.content?.trim() ?? "";
    } catch (ex) {
      throw ex;
    }
    return rtn;
  }

  static async CalculaServicioID(servicio) {
    let rtn = "";
    try {
      let msg = ` ${serviciosList} Un cliente me ha dicho que quiere este servicio: ${servicio}. Solo escribe el id al que corresponde el servicio al que se refiere mi cliente. Si no eres capaz de hacer esto, contesta sólamente con el carácter X.`;
      rtn = await ChatGPT.SendToGPT(msg);
      if (rtn == "X") {
        rtn = "";
      }
    } catch (ex) {
      throw ex;
    }
    return rtn;
  }

  static async CalculaCentroID(salon) {
    let rtn = "";
    try {
      //console.log(salonesList);
      let msg = ` ${salonesList} Un cliente me ha dicho que quiere este salon: ${salon}. Solo escribe el id al que corresponde el salon al que se refiere mi cliente. Si no eres capaz de hacer esto, contesta sólamente con el carácter X.`;
      rtn = await ChatGPT.SendToGPT(msg);
      if (rtn == "X") {
        rtn = "";
      }
    } catch (ex) {
      throw ex;
    }
    return rtn;
  }

  static async CalculaServicio(servicio) {
    let rtn = "";
    try {
      let msg = ` ${serviciosList} Un cliente me ha dicho que quiere este servicio: ${servicio}. Calculame la duración del servicio o servicios al que corresponde. No utlices para la respuesta ningun comando, devuelvemelo asi "nombre del servicio o los servicios: duracion total (solo el numero)". Si no eres capaz de hacer esto, contesta sólamente con el carácter X.`;
      rtn = await ChatGPT.SendToGPT(msg);
      if (rtn == "X") {
        rtn = "";
      }
    } catch (ex) {
      throw ex;
    }
    return rtn;
  }

  static async GetTime(fecha) {
    let rtn = "";
    try {
      let msg = `Esta es la fecha y hora que el cliente ha solicitado: ${fecha}. Solo devuelve la fecha y hora en formato ISO 8601 con zona horario de Madrid (Europa) y nada mas. Si no eres capaz de hacer esto, contesta sólamente con el carácter X.`;
      rtn = await ChatGPT.SendToGPT(msg);
      if (rtn == "X") {
        rtn = "";
      }
    } catch (ex) {
      throw ex;
    }
    return rtn;
  }

  static async CalculaPeluquero(peluquero, salonID) {
    let rtn = "";
    try {
      // Filtrar la lista de peluqueros solo para el centro especificado
      const peluquerosDelCentro = peluqueros
        .filter((peluquero) => peluquero.salonID === salonID)
        .map((p) => `${p.peluqueroID}: ${p.name}`)
        .join(", ");

      //console.log("peluquerosDelCentro:", peluquerosDelCentro);

      // Crear el mensaje solo con los peluqueros del centro
      let msg = ` ${peluquerosDelCentro} Un cliente me ha dicho que quiere en este peluquero: ${peluquero}. Solo escribe el id al que corresponde el peluquero al que se refiere mi cliente. Si puede ser más de un peluquero escribe "MOREINFO". Si no eres capaz de hacer esto, contesta sólamente con el carácter X.`;
      rtn = await ChatGPT.SendToGPT(msg);

      if (rtn == "X") {
        rtn = "";
      }
    } catch (ex) {
      throw ex;
    }
    return rtn;
  }
}

class StatisticsManager {
  constructor() {
    this.statsModel = Statistics; // Modelo de MongoDB para estadísticas diarias
  }

  // Guardar estadísticas diarias
  async saveDailyStats(stats) {
    const dailyStats = new this.statsModel({
      date: new Date(),
      confirmedAppointments: stats.confirmedAppointments,
      canceledAppointments: stats.canceledAppointments,
      failedOperations: stats.failedOperations,
      interactions: stats.interactions,
      feedbackResponses: stats.feedbackResponses,
    });
    await dailyStats.save();
  }

  // Obtener estadísticas del día actual
  async getTodayStatistics() {
    const today = moment().startOf("day").toDate();
    return await this.statsModel.findOne({ date: { $gte: today } });
  }

  // Incrementar citas confirmadas
  async incrementConfirmedAppointments() {
    const today = moment().startOf("day").toDate();
    await this.statsModel.findOneAndUpdate(
      { date: { $gte: today } },
      { $inc: { confirmedAppointments: 1 } },
      { upsert: true }
    );
  }

  // Método para incrementar el número de citas modificadas
  async incrementModifiedAppointments() {
    const today = moment().startOf("day").toDate();
    await this.statsModel.findOneAndUpdate(
      { date: { $gte: today } },
      { $inc: { modifiedAppointments: 1 } },
      { upsert: true }
    );
  }

  // Incrementar citas canceladas
  async incrementCanceledAppointments() {
    const today = moment().startOf("day").toDate();
    await this.statsModel.findOneAndUpdate(
      { date: { $gte: today } },
      { $inc: { canceledAppointments: 1 } },
      { upsert: true }
    );
  }

  // Incrementar operaciones fallidas
  async incrementFailedOperations() {
    const today = moment().startOf("day").toDate();
    await this.statsModel.findOneAndUpdate(
      { date: { $gte: today } },
      { $inc: { failedOperations: 1 } },
      { upsert: true }
    );
  }

  // Incrementar interacciones
  async incrementInteractions() {
    const today = moment().startOf("day").toDate();
    await this.statsModel.findOneAndUpdate(
      { date: { $gte: today } },
      { $inc: { interactions: 1 } },
      { upsert: true }
    );
  }

  // Incrementar respuestas de feedback
  async incrementFeedbackResponses() {
    const today = moment().startOf("day").toDate();
    await this.statsModel.findOneAndUpdate(
      { date: { $gte: today } },
      { $inc: { feedbackResponses: 1 } },
      { upsert: true }
    );
  }

  // Incrementar el contador de escaneos de QR
  async incrementQRScans() {
    const today = moment().startOf("day").toDate();
    await this.statsModel.findOneAndUpdate(
      { date: { $gte: today } },
      { $inc: { qrScans: 1 } },
      { upsert: true }
    );
  }

  async incrementReminderTemplatesSent() {
    const today = moment().startOf("day").toDate();
    await this.statsModel.findOneAndUpdate(
      { date: { $gte: today } },
      { $inc: { reminderTemplatesSent: 1 } },
      { upsert: true }
    );
  }

  // Obtener estadísticas del mes anterior
  async getMonthlyStatistics() {
    const startOfMonth = moment()
      .subtract(1, "month")
      .startOf("month")
      .toDate();
    const endOfMonth = moment().subtract(1, "month").endOf("month").toDate();

    const monthlyStats = await this.statsModel.aggregate([
      { $match: { date: { $gte: startOfMonth, $lte: endOfMonth } } },
      {
        $group: {
          _id: null,
          confirmedAppointments: { $sum: "$confirmedAppointments" },
          modifiedAppointments: { $sum: "$modifiedAppointments" },
          canceledAppointments: { $sum: "$canceledAppointments" },
          failedOperations: { $sum: "$failedOperations" },
          interactions: { $sum: "$interactions" },
          feedbackResponses: { $sum: "$feedbackResponses" },
          qrScans: { $sum: "$qrScans" },
          reminderTemplatesSent: { $sum: "$reminderTemplatesSent" },
        },
      },
    ]);

    return monthlyStats[0];
  }
}

// Inicializa el gestor de estadísticas
const statisticsManager = new StatisticsManager();

class CommandQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.priorities = {
      // Flujo principal de citas
      SERV: 1, // Primera: identificar el servicio
      CENTROID: 2, // Segunda: identificar el centro
      SPECIALITY: 3, // Tercera: identificar tipo de servicio
      LISTAPELUQ: 4, // Cuarta: buscar peluqueros
      GUARDACITA: 5, // Quinta: guardar la cita

      // Funcionalidades adicionales
      CANCELACITA: 10,
      MODCITA: 11,
      //'CONSULTHOR': 12,
      BUSCARCITA: 13,
      SALON: 14,
      CENTROINFO: 15,
    };
  }

  addCommand(command) {
    const priority = this.getCommandPriority(command);
    this.queue.push({ command, priority });
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  getCommandPriority(command) {
    for (const [cmd, priority] of Object.entries(this.priorities)) {
      if (command.includes(cmd)) return priority;
    }
    return 999;
  }

  async processNextCommand(conversation) {
    if (this.queue.length === 0 || this.processing) return "";

    this.processing = true;
    const { command } = this.queue.shift();
    console.log("command:", command);
    let rtn = "";

    try {
      let gpt = new Message(WhoEnum.ChatGPT);
      //console.log("gpt:", gpt);
      gpt.message = command;
      rtn = await conversation.ProcessOne(gpt);

      if (rtn !== "") {
        await WhatsApp.Responder(_phone_number_id, conversation.from, rtn);
        conversation.CancelWatchDog();
      }
    } catch (error) {
      DoLog(`Error procesando comando: ${error}`, Log.Error);
    }

    this.processing = false;

    // Si hay más comandos, procesar el siguiente
    if (this.queue.length > 0) {
      return await this.processNextCommand(conversation);
    }

    // Si no hay más comandos, solicitar respuesta final a ChatGPT
    if (this.queue.length === 0) {
      conversation.GetFull();
      let msg = `${conversation.full}.\n Teniendo toda esta conversación, ¿qué le dirías al cliente? SOLO escribe el mensaje que debería llegarle al cliente.`;
      let response = await ChatGPT.SendToGPT(msg);

      let responseMsg = new Message(WhoEnum.ChatGPT);
      responseMsg.message = response;
      conversation.AddMsg(responseMsg);

      return response;
    }

    return rtn;
  }
}

class ErrorHandler {
  static get commandExamples() {
    return {
    LISTAPELUQ: "LISTAPELUQ 2024-12-25T10:00:00Z Maria Q",
    GUARDACITA: "GUARDACITA | Corte de pelo | 2024-12-25T10:00:00+01:00 | Nervión Señoras | Maria | Juan Pérez",
    SERV: "SERV corte de pelo",
    SPECIALITY: "SPECIALITY Señora",
    CENTROID: "CENTROID Nervión Señoras",
    CONSULTHOR: "CONSULTHOR 2024-12-25T00:00:00Z Maria",
    MODCITA: "MODCITA 12/25/2024",
    CANCELACITA: "CANCELACITA 12/25/2024",
    CENTROINFO: "CENTROINFO Nervión Señoras"
  };
  }

  static async handleCommandError(command, error, conversation) {
    try {
      // Extraer el tipo de comando del comando original
      const commandType = Object.keys(ErrorHandler.commandExamples).find(cmd => command.includes(cmd));
      
      if (!commandType) {
        throw new Error("Tipo de comando no reconocido");
      }

      // Construir el mensaje para ChatGPT
      const prompt = `Has recibido un comando "${command}" que ha producido el siguiente error: "${error.message}".
                     El formato correcto para este tipo de comando debería ser como este ejemplo: "${ErrorHandler.commandExamples[commandType]}".
                     Por favor, analiza el error y devuelve el comando corregido manteniendo los datos originales pero en el formato correcto.
                     Solo devuelve el comando corregido, sin explicaciones adicionales.`;

      // Obtener la corrección de ChatGPT
      const correctedCommand = await ChatGPT.SendToGPT(prompt, false);

      if (!correctedCommand || correctedCommand.trim() === "") {
        throw new Error("No se pudo obtener una corrección válida");
      }

      // Log de la corrección
      DoLog(`Comando original: ${command}`);
      DoLog(`Comando corregido: ${correctedCommand}`);

      // Crear un nuevo mensaje del sistema para informar de la corrección
      const systemMsg = new Message(WhoEnum.System);
      systemMsg.message = `Se detectó y corrigió un error en el comando. Reintentando con el comando corregido.`;
      conversation.AddMsg(systemMsg);

      // Procesar el comando corregido
      let gpt = new Message(WhoEnum.ChatGPT);
      gpt.message = correctedCommand;
      return await conversation.ProcessOne(gpt);

    } catch (handlingError) {
      DoLog(`Error en el manejo de errores: ${handlingError}`, Log.Error);
      await LogError(
        conversation.from,
        "Error en el sistema de corrección de comandos",
        handlingError,
        conversation.salonID,
        conversation.salonNombre
      );
      throw handlingError;
    }
  }
}