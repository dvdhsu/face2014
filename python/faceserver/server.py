import tornado.ioloop
import tornado.web

class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.write("Face 2014!")

def main():
    application = tornado.web.Application(
        [("/", MainHandler)])

    application.listen(8888)
    tornado.ioloop.IOLoop.instance().start()
